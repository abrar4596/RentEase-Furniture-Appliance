import { z } from 'zod';

/**
 * Address book entry payload. The `pincode` is validated for format here and
 * checked against the live service zone (active cities) by the API layer.
 */
export const addressInputSchema = z.object({
  label: z.string().trim().min(1).max(50).optional(),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  line1: z.string().trim().min(5).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
  isDefault: z.boolean().optional(),
});

export type AddressInput = z.infer<typeof addressInputSchema>;

export const addressUpdateSchema = addressInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one address field is required',
  });

export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;
