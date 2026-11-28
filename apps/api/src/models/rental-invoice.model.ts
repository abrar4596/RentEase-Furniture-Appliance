import mongoose, { Document, Schema } from 'mongoose';
import {
  IRentalInvoice,
  RENTAL_INVOICE_STATUSES,
  RentalInvoiceStatus,
} from '@rentease/shared';

export interface IRentalInvoiceDocument extends Document<mongoose.Types.ObjectId> {
  _id: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  renterId: mongoose.Types.ObjectId;
  monthIndex: number;
  dueAt: Date;
  amountPaise: number;
  status: RentalInvoiceStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const rentalInvoiceSchema = new Schema<IRentalInvoiceDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    renterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    monthIndex: { type: Number, required: true, min: 1 },
    dueAt: { type: Date, required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: Object.values(RENTAL_INVOICE_STATUSES),
      default: RENTAL_INVOICE_STATUSES.PENDING,
      index: true,
    },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: String,
    paidAt: Date,
  },
  { timestamps: true }
);

rentalInvoiceSchema.index({ orderId: 1, monthIndex: 1 }, { unique: true });

export function formatRentalInvoice(doc: IRentalInvoiceDocument): IRentalInvoice {
  return {
    id: doc._id.toString(),
    orderId: doc.orderId.toString(),
    renterId: doc.renterId.toString(),
    monthIndex: doc.monthIndex,
    dueAt: doc.dueAt.toISOString(),
    amountPaise: doc.amountPaise,
    status: doc.status,
    razorpayOrderId: doc.razorpayOrderId,
    razorpayPaymentId: doc.razorpayPaymentId,
    paidAt: doc.paidAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const RentalInvoice = mongoose.model<IRentalInvoiceDocument>(
  'RentalInvoice',
  rentalInvoiceSchema
);
