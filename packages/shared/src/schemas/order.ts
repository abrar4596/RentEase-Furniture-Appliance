import { z } from 'zod';
import { deliveryScheduleSchema } from './cart.js';

export const createCheckoutSchema = deliveryScheduleSchema;

export const verifyPaymentSchema = z.object({
  orderId: z.string().min(1).optional(),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const kycDocumentSchema = z.object({
  publicId: z.string().min(1),
  url: z.string().url(),
});

/**
 * Per-document-type format rules (India-specific).
 * These patterns validate the structural shape only, not authentic UIDs.
 */
const KYC_DOCUMENT_PATTERNS: Record<string, RegExp> = {
  AADHAR: /^\d{12}$/,            // 12 digits
  PAN: /^[A-Z]{5}\d{4}[A-Z]$/,  // AAAAA9999A
  DL: /^[A-Z]{2}\d{2}\s?\d{11}$/, // State code + 13 digits
  PASSPORT: /^[A-Z]\d{7}$/,      // Letter + 7 digits
  VOTER_ID: /^[A-Z]{3}\d{7}$/,   // 3 letters + 7 digits
};

export const submitKycSchema = z
  .object({
    documentType: z.enum(['AADHAR', 'PAN', 'DL', 'PASSPORT', 'VOTER_ID']),
    documentNumber: z.string().trim().min(4).max(30),
    frontDocument: kycDocumentSchema,
    backDocument: kycDocumentSchema.optional(),
  })
  .superRefine((val, ctx) => {
    const pattern = KYC_DOCUMENT_PATTERNS[val.documentType];
    if (pattern && !pattern.test(val.documentNumber.toUpperCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documentNumber'],
        message: `Invalid ${val.documentType} number format`,
      });
    }
  });

export const reviewKycSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    rejectionReason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((value) => value.decision !== 'REJECTED' || !!value.rejectionReason, {
    message: 'rejectionReason is required when rejecting KYC',
    path: ['rejectionReason'],
  });

export const updateOrderFulfillmentSchema = z.object({
  status: z.enum(['OUT_FOR_DELIVERY', 'ACTIVE']),
  /** Optional Cloudinary proof-of-delivery photo. Only accepted when status is ACTIVE. */
  deliveryPhoto: z
    .object({ publicId: z.string().min(1), url: z.string().url() })
    .optional(),
});

export const maintenanceRequestSchema = z.object({
  description: z.string().trim().min(10).max(1000),
  photos: z
    .array(
      z.object({
        publicId: z.string().min(1),
        url: z.string().url(),
      })
    )
    .max(5)
    .optional()
    .default([]),
});

export const extendTenureSchema = z.object({
  additionalMonths: z.number().int().min(1).max(12),
});

export const returnRequestSchema = z.object({
  preferredPickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(500).optional(),
});

export const returnCompleteSchema = z.object({
  damageDescription: z.string().trim().max(1000).optional(),
  damagePhotos: z
    .array(
      z.object({
        publicId: z.string().min(1),
        url: z.string().url(),
      })
    )
    .max(5)
    .optional()
    .default([]),
  damageDeductionPaise: z.number().int().min(0).optional().default(0),
});
