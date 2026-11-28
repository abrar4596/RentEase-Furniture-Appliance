import { z } from 'zod';
import { PRODUCT_CATEGORIES } from '../constants/categories.js';
import {
  CATALOG_MAX_PAGE_SIZE,
  CATALOG_PAGE_SIZE,
  CATALOG_SORTS,
  PRODUCT_AVAILABILITIES,
} from '../constants/catalog.js';

/**
 * Query strings only ever carry "true"/"false"; `z.coerce.boolean()` would treat
 * the string "false" as truthy, so we parse the two literals explicitly.
 */
const booleanish = z.enum(['true', 'false']).transform((value) => value === 'true');

export const catalogQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(CATALOG_MAX_PAGE_SIZE).default(CATALOG_PAGE_SIZE),
    cityId: z.string().trim().min(1).optional(),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Pincode must be a valid 6-digit Indian pincode')
      .optional(),
    category: z.enum([PRODUCT_CATEGORIES.FURNITURE, PRODUCT_CATEGORIES.APPLIANCES]).optional(),
    subcategory: z.string().trim().min(1).max(120).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    minPricePaise: z.coerce.number().int().min(0).optional(),
    maxPricePaise: z.coerce.number().int().min(0).optional(),
    zeroDepositOnly: booleanish.optional(),
    availability: z
      .enum([
        PRODUCT_AVAILABILITIES.IN_STOCK,
        PRODUCT_AVAILABILITIES.LIMITED,
        PRODUCT_AVAILABILITIES.UNAVAILABLE,
      ])
      .optional(),
    sort: z
      .enum([
        CATALOG_SORTS.NEWEST,
        CATALOG_SORTS.PRICE_ASC,
        CATALOG_SORTS.PRICE_DESC,
        CATALOG_SORTS.FASTEST_DELIVERY,
      ])
      .optional(),
    inStock: booleanish.optional(),
  })
  .refine(
    (data) =>
      data.minPricePaise === undefined ||
      data.maxPricePaise === undefined ||
      data.minPricePaise <= data.maxPricePaise,
    {
      message: 'Minimum price must not exceed maximum price',
      path: ['minPricePaise'],
    }
  );

export type CatalogQueryInput = z.infer<typeof catalogQuerySchema>;
