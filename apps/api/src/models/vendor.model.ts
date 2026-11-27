import mongoose, { Schema, Document } from 'mongoose';
import { VENDOR_STATUSES, VendorStatus, IVendorProfile } from '@rentease/shared';

export interface IVendorProfileDocument extends Document<mongoose.Types.ObjectId> {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  businessName: string;
  contactPhone: string;
  cityId: mongoose.Types.ObjectId;
  servicePincodes: string[];
  verificationStatus: VendorStatus;
  commissionPercent?: number;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const vendorProfileSchema = new Schema<IVendorProfileDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
    },
    cityId: {
      type: Schema.Types.ObjectId,
      ref: 'City',
      required: true,
      index: true,
    },
    servicePincodes: {
      type: [String],
      required: true,
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: Object.values(VENDOR_STATUSES),
      default: VENDOR_STATUSES.PENDING,
      index: true,
    },
    commissionPercent: { type: Number, min: 0, max: 100 },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export function formatVendorProfile(
  doc: IVendorProfileDocument,
  cityName?: string
): IVendorProfile {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    businessName: doc.businessName,
    contactPhone: doc.contactPhone,
    cityId: doc.cityId.toString(),
    cityName,
    servicePincodes: doc.servicePincodes,
    verificationStatus: doc.verificationStatus,
    commissionPercent: doc.commissionPercent,
    rejectionReason: doc.rejectionReason,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const VendorProfile = mongoose.model<IVendorProfileDocument>(
  'VendorProfile',
  vendorProfileSchema
);
