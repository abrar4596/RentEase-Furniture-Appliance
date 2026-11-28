import {
  IPaymentLedgerEntry,
  LEDGER_DIRECTIONS,
  LEDGER_ENTRY_TYPES,
  LedgerEntryType,
} from '@rentease/shared';
import mongoose from 'mongoose';
import {
  PaymentLedger,
  IPaymentLedgerDocument,
  formatPaymentLedgerEntry,
} from '../models/payment-ledger.model.js';
import { IOrderDocument } from '../models/order.model.js';
import { IRefundDocument } from '../models/refund.model.js';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * Append-only writer for the payment ledger. Every entry is immutable, so
 * corrections are recorded as new compensating entries and replays are made
 * idempotent (existence checks + the unique refund-id index) rather than by
 * updating rows in place.
 */
export class PaymentLedgerService {
  /**
   * Records the upfront rent + deposit collected for a paid order as one entry
   * per component. Idempotent per (order, component, gateway payment) so a
   * duplicate webhook cannot double-credit the ledger.
   */
  public async recordUpfrontPayment(order: IOrderDocument): Promise<void> {
    if (!order.razorpayPaymentId) return;
    const lines: Array<{ type: LedgerEntryType; amountPaise: number }> = [
      { type: LEDGER_ENTRY_TYPES.RENT, amountPaise: order.subtotalRentPaise },
      { type: LEDGER_ENTRY_TYPES.DEPOSIT, amountPaise: order.securityDepositPaise },
    ];
    for (const line of lines) {
      if (line.amountPaise <= 0) continue;
      const alreadyRecorded = await PaymentLedger.exists({
        orderId: order._id,
        type: line.type,
        razorpayPaymentId: order.razorpayPaymentId,
      });
      if (alreadyRecorded) continue;
      await PaymentLedger.create({
        orderId: order._id,
        renterId: order.renterId,
        type: line.type,
        direction: LEDGER_DIRECTIONS.DEBIT,
        amountPaise: line.amountPaise,
        razorpayPaymentId: order.razorpayPaymentId,
        note: 'Upfront payment captured',
      });
    }
  }

  /** Records a later monthly rent or extension payment against the renter ledger. */
  public async recordRentPayment(
    order: IOrderDocument,
    amountPaise: number,
    razorpayPaymentId: string,
    note: string
  ): Promise<void> {
    const alreadyRecorded = await PaymentLedger.exists({
      orderId: order._id,
      razorpayPaymentId,
      type: LEDGER_ENTRY_TYPES.RENT,
    });
    if (alreadyRecorded) return;
    await PaymentLedger.create({
      orderId: order._id,
      renterId: order.renterId,
      type: LEDGER_ENTRY_TYPES.RENT,
      direction: LEDGER_DIRECTIONS.DEBIT,
      amountPaise,
      razorpayPaymentId,
      note,
    });
  }

  /** Records a refund credit. Safe to call twice for the same refund id. */
  public async recordRefund(order: IOrderDocument, refund: IRefundDocument): Promise<void> {
    try {
      await PaymentLedger.create({
        orderId: order._id,
        renterId: order.renterId,
        type: LEDGER_ENTRY_TYPES.REFUND,
        direction: LEDGER_DIRECTIONS.CREDIT,
        amountPaise: refund.amountPaise,
        razorpayPaymentId: refund.razorpayPaymentId,
        razorpayRefundId: refund.razorpayRefundId,
        note: refund.reason,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) return;
      throw error;
    }
  }

  public async listForOrder(orderId: string): Promise<IPaymentLedgerEntry[]> {
    const entries = await PaymentLedger.find({
      orderId: new mongoose.Types.ObjectId(orderId),
    }).sort({ createdAt: 1 });
    return (entries as IPaymentLedgerDocument[]).map(formatPaymentLedgerEntry);
  }
}

export const paymentLedgerService = new PaymentLedgerService();
