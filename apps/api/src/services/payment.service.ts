import mongoose from 'mongoose';
import { ORDER_STATES } from '@rentease/shared';
import { Order, IOrderDocument } from '../models/order.model.js';
import { InventoryLock } from '../models/inventory-lock.model.js';
import { User } from '../models/user.model.js';
import { emailService } from './email.service.js';
import { paymentLedgerService } from './payment-ledger.service.js';
import { logger } from '../utils/logger.js';

export interface SettleCapturedPaymentInput {
  razorpayPaymentId: string;
  razorpaySignature?: string;
}

/**
 * Applies the business outcome of an upfront payment.
 *
 * Both the client verification endpoint and the Razorpay webhook funnel through
 * here so the "money captured" side effects live in one place. Settlement is
 * exactly-once: the PENDING_PAYMENT → PENDING_KYC transition is an atomic
 * compare-and-set, so whichever caller wins performs the ledger writes and the
 * confirmation email, and every replay becomes a harmless no-op.
 */
export class PaymentService {
  public async settleCapturedOrder(
    order: IOrderDocument,
    input: SettleCapturedPaymentInput
  ): Promise<{ order: IOrderDocument; settled: boolean }> {
    // A captured payment for a closed order must never resurrect it. This is the
    // "late webhook after cancellation" guard: the money is real but the order is
    // gone, so we flag it for manual reconciliation instead of changing state.
    if (order.status === ORDER_STATES.CANCELLED || order.status === ORDER_STATES.REFUNDED) {
      logger.warn(
        { orderId: order._id.toString(), status: order.status, paymentId: input.razorpayPaymentId },
        'Captured payment received for a closed order; ignoring (manual reconciliation required)'
      );
      return { order, settled: false };
    }

    if (order.status !== ORDER_STATES.PENDING_PAYMENT) {
      // Already settled (duplicate webhook or client retry): re-apply the
      // idempotent side effects in case an earlier attempt was interrupted.
      await this.applySettlementSideEffects(order);
      return { order, settled: false };
    }

    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: ORDER_STATES.PENDING_PAYMENT },
      {
        $set: {
          status: ORDER_STATES.PENDING_KYC,
          razorpayPaymentId: input.razorpayPaymentId,
          ...(input.razorpaySignature ? { razorpaySignature: input.razorpaySignature } : {}),
        },
      },
      { new: true }
    );

    if (!updated) {
      // A concurrent caller (webhook vs. client verify) won the transition.
      await this.applySettlementSideEffects(order);
      return { order, settled: false };
    }

    await this.applySettlementSideEffects(updated);
    await this.sendConfirmation(updated);
    return { order: updated, settled: true };
  }

  /** Turns an order's open reservations into firm allocations. Idempotent. */
  public async commitOrderLocks(orderId: string): Promise<void> {
    await InventoryLock.updateMany(
      { orderId: new mongoose.Types.ObjectId(orderId), released: false },
      { $set: { committed: true } }
    );
  }

  private async applySettlementSideEffects(order: IOrderDocument): Promise<void> {
    await this.commitOrderLocks(order._id.toString());
    await paymentLedgerService.recordUpfrontPayment(order);
  }

  private async sendConfirmation(order: IOrderDocument): Promise<void> {
    try {
      const renter = await User.findById(order.renterId);
      if (!renter) return;
      await emailService.sendOrderConfirmationEmail(renter.email, {
        id: order._id.toString(),
        totalUpfrontPaise: order.totalUpfrontPaise,
        itemCount: order.items.length,
      });
    } catch (error) {
      // Notification failure must never roll back a confirmed payment.
      logger.error(
        { err: error, orderId: order._id.toString() },
        'Order confirmation email failed'
      );
    }
  }
}

export const paymentService = new PaymentService();
