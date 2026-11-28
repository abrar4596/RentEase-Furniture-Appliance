import mongoose from 'mongoose';
import {
  CreateRefundInput,
  IRefund,
  ORDER_STATES,
  REFUND_STATUSES,
  RefundStatus,
  canTransitionOrder,
} from '@rentease/shared';
import { Refund, IRefundDocument, formatRefund } from '../models/refund.model.js';
import { Order, IOrderDocument } from '../models/order.model.js';
import { paymentGateway } from '../adapters/payment-gateway.adapter.js';
import { paymentLedgerService } from './payment-ledger.service.js';
import { checkoutService } from './checkout.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';

/** Maps a gateway refund status to the platform's refund vocabulary. */
function mapGatewayRefundStatus(status: string): RefundStatus {
  const normalized = status.toLowerCase();
  if (normalized === 'processed') return REFUND_STATUSES.PROCESSED;
  if (normalized === 'failed') return REFUND_STATUSES.FAILED;
  return REFUND_STATUSES.PENDING;
}

/**
 * Refund orchestration (full or partial) for captured payments.
 *
 * Razorpay is reached only through the {@link paymentGateway} adapter. Every
 * refund is stored as a `Refund` row and mirrored into the immutable payment
 * ledger; the gateway's `refund.processed` webhook reconciles the row (rather
 * than trusting the caller), so the stored record is the single source of truth.
 */
export class RefundService {
  /** Value already refunded or in-flight for an order (failed refunds excluded). */
  public async refundedTotal(orderId: string): Promise<number> {
    const refunds = await Refund.find({
      orderId: new mongoose.Types.ObjectId(orderId),
      status: { $ne: REFUND_STATUSES.FAILED },
    });
    return refunds.reduce((sum, refund) => sum + refund.amountPaise, 0);
  }

  /**
   * Issues a full or partial refund. Omit `amountPaise` for a full refund of the
   * outstanding balance. The amount is always clamped against what was captured
   * minus prior refunds, so a caller can never refund more than the renter paid.
   */
  public async createRefund(
    actorId: string,
    orderId: string,
    input: CreateRefundInput
  ): Promise<IRefund> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (!order.razorpayPaymentId) {
      throw new ValidationError('This order has no captured payment to refund');
    }

    const alreadyRefunded = await this.refundedTotal(orderId);
    const reserved = order.reservedRefundPaise || 0;
    const refundable = order.totalUpfrontPaise - alreadyRefunded - reserved;
    if (refundable <= 0) throw new ConflictError('This order has already been fully refunded');

    const amountPaise = input.amountPaise ?? refundable;
    if (amountPaise > refundable) {
      throw new ValidationError(
        `Refund exceeds the refundable balance of ₹${(refundable / 100).toFixed(2)}`
      );
    }

    const reservedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ['$reservedRefundPaise', 0] }, amountPaise] },
            { $subtract: [order.totalUpfrontPaise, alreadyRefunded] },
          ],
        },
      },
      { $inc: { reservedRefundPaise: amountPaise } },
      { new: true }
    );
    if (!reservedOrder) throw new ConflictError('The refundable balance changed concurrently');

    let result;
    try {
      result = await paymentGateway.createRefund({
        paymentId: order.razorpayPaymentId,
        amountPaise,
        notes: { orderId: order._id.toString(), reason: input.reason },
      });
    } catch (error) {
      await Order.findByIdAndUpdate(order._id, { $inc: { reservedRefundPaise: -amountPaise } });
      throw error;
    }

    let refund;
    try {
      refund = await Refund.create({
        orderId: order._id,
        razorpayPaymentId: order.razorpayPaymentId,
        amountPaise: result.amountPaise || amountPaise,
        reason: input.reason,
        status: mapGatewayRefundStatus(result.status),
        razorpayRefundId: result.id,
        createdBy: new mongoose.Types.ObjectId(actorId),
      });
    } catch (error) {
      throw error;
    } finally {
      await Order.findByIdAndUpdate(order._id, { $inc: { reservedRefundPaise: -amountPaise } });
    }

    if (refund.status === REFUND_STATUSES.PROCESSED) {
      await this.applyRefundEffects(order, refund);
    }
    return formatRefund(refund);
  }

  /**
   * Reconciles a gateway `refund.processed` event against its stored record.
   * Returns the reconciled row, or `null` when no local record exists (the
   * refund was issued out-of-band and needs manual attention).
   */
  public async reconcileProcessedRefund(razorpayRefundId: string): Promise<IRefundDocument | null> {
    const refund = await Refund.findOne({ razorpayRefundId });
    if (!refund) {
      logger.warn({ razorpayRefundId }, 'Received refund.processed for an unknown refund');
      return null;
    }
    if (refund.status === REFUND_STATUSES.PROCESSED) return refund;
    const order = await Order.findById(refund.orderId);
    if (!order) return refund;
    await this.applyRefundEffects(order, refund);
    return refund;
  }

  public async listForOrder(orderId: string): Promise<IRefund[]> {
    const refunds = await Refund.find({
      orderId: new mongoose.Types.ObjectId(orderId),
    }).sort({ createdAt: 1 });
    return refunds.map(formatRefund);
  }

  /**
   * Marks the order REFUNDED and returns its committed stock. Used when the
   * cumulative refunds cover the full captured amount. Returns the stock even
   * when the state machine forbids the label change, so inventory never leaks.
   */
  public async settleFullRefund(order: IOrderDocument): Promise<void> {
    if (
      order.status !== ORDER_STATES.REFUNDED &&
      canTransitionOrder(order.status, ORDER_STATES.REFUNDED)
    ) {
      order.status = ORDER_STATES.REFUNDED;
      await order.save();
    }
    await checkoutService.releaseOrderLocks(order._id.toString());
  }

  /** Persists the processed state, mirrors it into the ledger and settles fully-paid orders. */
  private async applyRefundEffects(order: IOrderDocument, refund: IRefundDocument): Promise<void> {
    if (refund.status !== REFUND_STATUSES.PROCESSED) {
      refund.status = REFUND_STATUSES.PROCESSED;
    }
    refund.processedAt = refund.processedAt ?? new Date();
    await refund.save();

    await paymentLedgerService.recordRefund(order, refund);

    const totalRefunded = await this.refundedTotal(order._id.toString());
    if (totalRefunded >= order.totalUpfrontPaise) {
      await this.settleFullRefund(order);
    }
  }
}

export const refundService = new RefundService();
