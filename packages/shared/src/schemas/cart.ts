import { z } from 'zod';
import { DELIVERY_SLOTS } from '../constants/delivery.js';

export const deliveryAddressSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  line1: z.string().trim().min(5).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
});

export const deliverySlotSchema = z.enum([
  DELIVERY_SLOTS.MORNING,
  DELIVERY_SLOTS.AFTERNOON,
  DELIVERY_SLOTS.EVENING,
]);

export const addCartItemSchema = z.object({
  productId: z.string().min(1),
  tenureMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  quantity: z.number().int().min(1).max(10).default(1),
});

export const updateCartItemSchema = z
  .object({
    tenureMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
    quantity: z.number().int().min(1).max(10).optional(),
  })
  .refine((value) => value.tenureMonths !== undefined || value.quantity !== undefined, {
    message: 'At least one cart field is required',
  });

export const deliveryScheduleSchema = z.object({
  deliveryAddress: deliveryAddressSchema,
  preferredDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  preferredDeliverySlot: deliverySlotSchema,
});

export const deliverySlotsQuerySchema = z.object({
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
});
