import mongoose, { Schema, Document } from 'mongoose';
import { IAddress } from '@rentease/shared';

export interface IAddressDocument extends Document<mongoose.Types.ObjectId> {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  label?: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddressDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, trim: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// The address book is always listed per renter, default first.
addressSchema.index({ userId: 1, isDefault: -1, createdAt: -1 });

export function formatAddress(doc: IAddressDocument): IAddress {
  return {
    id: doc._id.toString(),
    label: doc.label,
    fullName: doc.fullName,
    phone: doc.phone,
    line1: doc.line1,
    line2: doc.line2,
    city: doc.city,
    state: doc.state,
    pincode: doc.pincode,
    isDefault: doc.isDefault,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const Address = mongoose.model<IAddressDocument>('Address', addressSchema);
