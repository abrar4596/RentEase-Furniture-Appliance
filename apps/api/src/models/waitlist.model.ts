import mongoose, { Schema, Document } from 'mongoose';
import { IWaitlistEntry, WaitlistStatus } from '@rentease/shared';

export interface IWaitlistEntryDocument extends Document<mongoose.Types.ObjectId> {
  _id: mongoose.Types.ObjectId;
  cityName: string;
  pincode?: string;
  name?: string;
  email?: string;
  phone?: string;
  status: WaitlistStatus;
  createdAt: Date;
  updatedAt: Date;
}

const waitlistEntrySchema = new Schema<IWaitlistEntryDocument>(
  {
    cityName: { type: String, required: true, trim: true, index: true },
    pincode: { type: String, trim: true, index: true },
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    status: {
      type: String,
      enum: ['PENDING', 'NOTIFIED'],
      default: 'PENDING',
      index: true,
    },
  },
  { timestamps: true }
);

// Ops lookup: "who is waiting in this city / pincode?"
waitlistEntrySchema.index({ cityName: 1, pincode: 1 });

export function formatWaitlistEntry(doc: IWaitlistEntryDocument): IWaitlistEntry {
  return {
    id: doc._id.toString(),
    cityName: doc.cityName,
    pincode: doc.pincode,
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const WaitlistEntry = mongoose.model<IWaitlistEntryDocument>(
  'WaitlistEntry',
  waitlistEntrySchema
);
