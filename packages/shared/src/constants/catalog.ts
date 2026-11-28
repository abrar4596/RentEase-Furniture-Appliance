export const PRODUCT_AVAILABILITIES = {
  IN_STOCK: 'in_stock',
  LIMITED: 'limited',
  UNAVAILABLE: 'unavailable',
} as const;

export type ProductAvailability =
  (typeof PRODUCT_AVAILABILITIES)[keyof typeof PRODUCT_AVAILABILITIES];

/**
 * A product is surfaced as "limited" when at most this many units remain.
 * Exact stock figures are never exposed to renters — only this derived bucket —
 * so vendor inventory internals stay private.
 */
export const LIMITED_STOCK_THRESHOLD = 3;

export const CATALOG_SORTS = {
  NEWEST: 'newest',
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
  FASTEST_DELIVERY: 'fastest_delivery',
} as const;

export type CatalogSort = (typeof CATALOG_SORTS)[keyof typeof CATALOG_SORTS];

export const CATALOG_PAGE_SIZE = 12;
export const CATALOG_MAX_PAGE_SIZE = 100;
