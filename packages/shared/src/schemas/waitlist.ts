import { z } from 'zod';

/**
 * Captures interest from a visitor whose city/pincode is not yet serviceable.
 * At least one contact channel (email or phone) is required so ops can follow up.
 */
export const createWaitlistEntrySchema = z
  .object({
    cityName: z.string().trim().min(2, 'City name is required').max(120),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Please enter a valid 6-digit pincode')
      .optional(),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120).optional(),
    email: z.string().trim().email('Please enter a valid email address').toLowerCase().optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number')
      .optional(),
  })
  .refine((data) => Boolean(data.email || data.phone), {
    message: 'Please provide an email address or a phone number so we can notify you',
    path: ['email'],
  });

export type CreateWaitlistEntryInput = z.infer<typeof createWaitlistEntrySchema>;
