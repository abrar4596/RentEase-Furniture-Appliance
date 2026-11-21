import { z } from 'zod';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  PRODUCT_STATUSES,
} from '../constants/categories.js';

export const tenureTierSchema = z.object({
  tenureMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  monthlyRentPaise: z.number().int().positive('Monthly rent must be a positive integer in paise'),
});

export const productImageSchema = z.object({
  publicId: z.string().min(1, 'Image public ID is required'),
  url: z.string().url('Invalid image URL'),
  thumbnailUrl: z.string().url().optional(),
});

export const createProductSchema = z.object({
  category: z.enum([PRODUCT_CATEGORIES.FURNITURE, PRODUCT_CATEGORIES.APPLIANCES]),
  subcategory: z.string().trim().min(2, 'Subcategory is required'),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().trim().min(10, 'Description must be at least 10 characters'),
  specs: z.record(z.string()).default({}),
  images: z.array(productImageSchema).min(1, 'At least one product image is required'),
  condition: z.enum([
    PRODUCT_CONDITIONS.BRAND_NEW,
    PRODUCT_CONDITIONS.LIKE_NEW,
    PRODUCT_CONDITIONS.REFURBISHED,
  ]),
  stockCount: z.number().int().min(0, 'Stock count cannot be negative'),
  // Security deposit in integer paise (₹0 deposit is supported)
  securityDepositPaise: z
    .number()
    .int()
    .min(0, 'Security deposit must be a non-negative integer in paise'),
  tenureTiers: z.array(tenureTierSchema).min(1, 'At least one tenure pricing tier is required'),
  deliveryLeadTimeHours: z.number().int().min(1).max(168).default(48),
  cityId: z.string().min(1, 'City ID is required'),
  status: z
    .enum([PRODUCT_STATUSES.DRAFT, PRODUCT_STATUSES.ACTIVE, PRODUCT_STATUSES.PAUSED])
    .default(PRODUCT_STATUSES.DRAFT),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const updateProductStockSchema = z.object({
  stockCount: z.number().int().min(0, 'Stock count cannot be negative'),
});
export type UpdateProductStockInput = z.infer<typeof updateProductStockSchema>;

export const updateProductStatusSchema = z.object({
  status: z.enum([PRODUCT_STATUSES.DRAFT, PRODUCT_STATUSES.ACTIVE, PRODUCT_STATUSES.PAUSED]),
});
export type UpdateProductStatusInput = z.infer<typeof updateProductStatusSchema>;
