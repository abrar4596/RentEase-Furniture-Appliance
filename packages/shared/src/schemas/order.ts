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

export const submitKycSchema = z.object({
  documentType: z.enum(['AADHAR', 'PAN', 'DL', 'PASSPORT', 'VOTER_ID']),
  documentNumber: z.string().trim().min(4).max(30),
  frontDocument: kycDocumentSchema,
  backDocument: kycDocumentSchema.optional(),
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
});

export const maintenanceRequestSchema = z.object({
  description: z.string().trim().min(10).max(1000),
  category: z.enum(['GENERAL', 'ELECTRICAL', 'PLUMBING', 'FURNITURE', 'APPLIANCE']).default('GENERAL'),
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

export const maintenanceStatusSchema = z.object({
  status: z.enum(['ASSIGNED', 'IN_PROGRESS', 'RESOLVED']),
});

export const damageDisputeSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
