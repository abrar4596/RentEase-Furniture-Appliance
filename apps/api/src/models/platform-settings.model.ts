import mongoose, { Document, Schema } from 'mongoose';
import { IPlatformSettings } from '@rentease/shared';

export interface IPlatformSettingsDocument extends Document<mongoose.Types.ObjectId> {
  platformCommissionPercent: number;
  kycWindowHours: number;
  reservationTtlMinutes: number;
  updatedAt: Date;
  createdAt: Date;
}

const settingsSchema = new Schema<IPlatformSettingsDocument>(
  {
    platformCommissionPercent: { type: Number, min: 0, max: 100, default: 15 },
    kycWindowHours: { type: Number, min: 1, max: 168, default: 24 },
    reservationTtlMinutes: { type: Number, min: 5, max: 60, default: 15 },
  },
  { timestamps: true }
);

export function formatPlatformSettings(doc: IPlatformSettingsDocument): IPlatformSettings {
  return {
    id: doc._id.toString(),
    platformCommissionPercent: doc.platformCommissionPercent,
    kycWindowHours: doc.kycWindowHours,
    reservationTtlMinutes: doc.reservationTtlMinutes,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const PlatformSettings = mongoose.model<IPlatformSettingsDocument>(
  'PlatformSettings',
  settingsSchema
);
