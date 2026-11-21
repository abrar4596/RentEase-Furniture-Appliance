import { z } from 'zod';

export const adminOrderSearchSchema = z.object({
  status: z.string().optional(),
  renterId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
});

export const adminDamageArbitrationSchema = z.object({
  decision: z.enum(['APPROVE', 'ADJUST', 'DISMISS']),
  deductedPaise: z.number().int().min(0).optional(),
  reason: z.string().trim().min(3).max(500),
});

export const adminCitySchema = z.object({
  name: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincodes: z.array(z.string().regex(/^[1-9][0-9]{5}$/)).min(1),
  isActive: z.boolean().optional(),
});

export const adminCityUpdateSchema = adminCitySchema.partial();
