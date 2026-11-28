import mongoose, { Document, Schema } from 'mongoose';
import { IRefund, REFUND_STATUSES, RefundStatus } from '@rentease/shared';

export interface IRefundDocument extends Document<mongoose.Types.ObjectId> {
  orderId: mongoose.Types.ObjectId;
  razorpayPaymentId: string;
  amountPaise: number;
  reason: string;
  status: RefundStatus;
  razorpayRefundId?: string;
  createdBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const refundSchema = new Schema<IRefundDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    razorpayPaymentId: { type: String, required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(REFUND_STATUSES),
      default: REFUND_STATUSES.PENDING,
      index: true,
    },
    razorpayRefundId: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt: Date,
  },
  { timestamps: true }
);

// One gateway refund id maps to at most one record, so webhook retries reconcile
// against the same row instead of creating duplicates.
refundSchema.index({ razorpayRefundId: 1 }, { unique: true, sparse: true });

export function formatRefund(doc: IRefundDocument): IRefund {
  return {
    id: doc._id.toString(),
    orderId: doc.orderId.toString(),
    razorpayPaymentId: doc.razorpayPaymentId,
    amountPaise: doc.amountPaise,
    reason: doc.reason,
    status: doc.status,
    razorpayRefundId: doc.razorpayRefundId,
    createdBy: doc.createdBy?.toString(),
    processedAt: doc.processedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const Refund = mongoose.model<IRefundDocument>('Refund', refundSchema);
