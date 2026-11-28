import { z } from 'zod';

export const createRefundSchema = z.object({
  /**
   * Amount to refund in paise. Omit for a full refund of the order's upfront
   * total. The server always clamps this against the amount actually captured.
   */
  amountPaise: z.number().int().min(1).optional(),
  reason: z.string().trim().min(3).max(500),
});

export type CreateRefundInput = z.infer<typeof createRefundSchema>;
