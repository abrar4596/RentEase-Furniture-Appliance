import mongoose, { Document, Schema } from 'mongoose';
import { IVendorLedgerEntry } from '@rentease/shared';

export interface IVendorLedgerDocument extends Document<mongoose.Types.ObjectId> {
  vendorId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  grossRentPaise: number;
  commissionPercent: number;
  commissionPaise: number;
  netPayablePaise: number;
  status: 'PENDING' | 'PAID';
  payoutReference?: string;
  paidAt?: Date;
  paidBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vendorLedgerSchema = new Schema<IVendorLedgerDocument>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'VendorProfile', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    grossRentPaise: { type: Number, required: true, min: 0 },
    commissionPercent: { type: Number, required: true, min: 0, max: 100 },
    commissionPaise: { type: Number, required: true, min: 0 },
    netPayablePaise: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['PENDING', 'PAID'], default: 'PENDING', index: true },
    payoutReference: { type: String, trim: true },
    paidAt: Date,
    paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

vendorLedgerSchema.index({ vendorId: 1, orderId: 1 }, { unique: true });

export function formatVendorLedger(doc: IVendorLedgerDocument): IVendorLedgerEntry {
  return {
    id: doc._id.toString(),
    vendorId: doc.vendorId.toString(),
    orderId: doc.orderId.toString(),
    grossRentPaise: doc.grossRentPaise,
    commissionPercent: doc.commissionPercent,
    commissionPaise: doc.commissionPaise,
    netPayablePaise: doc.netPayablePaise,
    status: doc.status,
    payoutReference: doc.payoutReference,
    paidAt: doc.paidAt?.toISOString(),
    paidBy: doc.paidBy?.toString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const VendorLedger = mongoose.model<IVendorLedgerDocument>(
  'VendorLedger',
  vendorLedgerSchema
);
