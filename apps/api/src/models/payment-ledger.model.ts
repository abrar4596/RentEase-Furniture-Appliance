import mongoose, { Document, Schema } from 'mongoose';
import {
  IPaymentLedgerEntry,
  LEDGER_DIRECTIONS,
  LEDGER_ENTRY_TYPES,
  LedgerDirection,
  LedgerEntryType,
} from '@rentease/shared';

export interface IPaymentLedgerDocument extends Document<mongoose.Types.ObjectId> {
  orderId: mongoose.Types.ObjectId;
  renterId: mongoose.Types.ObjectId;
  type: LedgerEntryType;
  direction: LedgerDirection;
  amountPaise: number;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentLedgerSchema = new Schema<IPaymentLedgerDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    renterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(LEDGER_ENTRY_TYPES), required: true },
    direction: { type: String, enum: Object.values(LEDGER_DIRECTIONS), required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    razorpayPaymentId: String,
    razorpayRefundId: String,
    note: String,
  },
  { timestamps: true }
);

// A refund entry is unique per gateway refund id so webhook retries cannot
// double-credit. Sparse so non-refund rows (which leave the field unset) are not
// constrained.
paymentLedgerSchema.index({ razorpayRefundId: 1 }, { unique: true, sparse: true });

// The ledger is append-only: history must never be rewritten or erased. Any
// attempt to mutate or delete an entry is rejected at the model boundary.
// (Test/ops cleanup must go through the raw collection.)
function rejectMutation(): never {
  throw new Error('Payment ledger entries are immutable and cannot be modified or deleted');
}

paymentLedgerSchema.pre('updateOne', rejectMutation);
paymentLedgerSchema.pre('updateMany', rejectMutation);
paymentLedgerSchema.pre('findOneAndUpdate', rejectMutation);
paymentLedgerSchema.pre('findOneAndReplace', rejectMutation);
paymentLedgerSchema.pre('findOneAndDelete', rejectMutation);
paymentLedgerSchema.pre('deleteOne', rejectMutation);
paymentLedgerSchema.pre('deleteMany', rejectMutation);

export function formatPaymentLedgerEntry(doc: IPaymentLedgerDocument): IPaymentLedgerEntry {
  return {
    id: doc._id.toString(),
    orderId: doc.orderId.toString(),
    renterId: doc.renterId.toString(),
    type: doc.type,
    direction: doc.direction,
    amountPaise: doc.amountPaise,
    razorpayPaymentId: doc.razorpayPaymentId,
    razorpayRefundId: doc.razorpayRefundId,
    note: doc.note,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const PaymentLedger = mongoose.model<IPaymentLedgerDocument>(
  'PaymentLedger',
  paymentLedgerSchema
);
