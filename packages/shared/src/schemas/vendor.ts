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
});

export type AdminVerifyVendorInput = z.infer<typeof adminVerifyVendorSchema>;
