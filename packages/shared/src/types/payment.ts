import { LedgerDirection, LedgerEntryType, RefundStatus } from '../constants/payments.js';

/**
 * An append-only money movement tied to an order. Entries are never mutated or
 * deleted; corrections are recorded as new compensating entries.
 */
export interface IPaymentLedgerEntry {
  id: string;
  orderId: string;
  renterId: string;
  type: LedgerEntryType;
  direction: LedgerDirection;
  amountPaise: number;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  note?: string;
  createdAt: string;
}

export interface IRefund {
  id: string;
  orderId: string;
  razorpayPaymentId: string;
  amountPaise: number;
  reason: string;
  status: RefundStatus;
  razorpayRefundId?: string;
  /** Admin who initiated the refund. */
  createdBy?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}
