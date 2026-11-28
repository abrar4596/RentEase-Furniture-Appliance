import { z } from 'zod';

/**
 * Serviceability can be checked by either a pincode (definitive) or a city id
 * (city-level). At least one is required.
 */
export const serviceabilityQuerySchema = z
  .object({
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Pincode must be a valid 6-digit Indian pincode')
      .optional(),
    cityId: z.string().trim().min(1).optional(),
  })
  .refine((data) => Boolean(data.pincode || data.cityId), {
    message: 'Provide a pincode or a cityId to check serviceability',
    path: ['pincode'],
  });

export type ServiceabilityQueryInput = z.infer<typeof serviceabilityQuerySchema>;
