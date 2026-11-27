import { z } from 'zod';
import { VENDOR_STATUSES } from '../constants/categories.js';

/**
 * 6-digit Indian PIN code validation regex
 */
export const pincodeSchema = z.string().regex(/^[1-9][0-9]{5}$/, 'Invalid 6-digit Indian pincode');

export const createVendorProfileSchema = z.object({
  businessName: z.string().trim().min(3, 'Business name must be at least 3 characters').max(150),
  contactPhone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian phone number'),
  cityId: z.string().min(1, 'City selection is required'),
  servicePincodes: z
    .array(pincodeSchema)
    .min(1, 'At least one serviceable pincode must be specified'),
});

export type CreateVendorProfileInput = z.infer<typeof createVendorProfileSchema>;

export const updateVendorProfileSchema = createVendorProfileSchema.partial();
export type UpdateVendorProfileInput = z.infer<typeof updateVendorProfileSchema>;

export const adminVerifyVendorSchema = z.object({
  status: z.enum([VENDOR_STATUSES.APPROVED, VENDOR_STATUSES.REJECTED, VENDOR_STATUSES.SUSPENDED]),
  rejectionReason: z.string().max(500).optional(),
  /** Override platform commission for this vendor (0–100). Omit to use platform default. */
  commissionPercent: z.number().min(0).max(100).optional(),
});

export type AdminVerifyVendorInput = z.infer<typeof adminVerifyVendorSchema>;

export const markVendorPayoutSchema = z.object({
  vendorId: z.string().min(1),
  ledgerEntryIds: z.array(z.string().min(1)).min(1),
  payoutReference: z.string().trim().min(3).max(200),
});

export type MarkVendorPayoutInput = z.infer<typeof markVendorPayoutSchema>;

export const updatePlatformSettingsSchema = z.object({
  platformCommissionPercent: z.number().min(0).max(100).optional(),
  kycWindowHours: z.number().int().min(1).max(168).optional(),
  reservationTtlMinutes: z.number().int().min(5).max(60).optional(),
  deliverySlotCapacity: z.number().int().min(1).max(100).optional(),
  blackoutDates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'))
    .max(365)
    .optional(),
});
