import {
  LIMITED_STOCK_THRESHOLD,
  PRODUCT_AVAILABILITIES,
  ProductAvailability,
} from '../constants/catalog.js';

/**
 * Derives a renter-facing availability bucket from a vendor's raw stock count.
 *
 * This is the ONLY public signal of stock: callers must never surface
 * `stockCount` itself, only the bucket returned here.
 */
export function deriveAvailability(stockCount: number): ProductAvailability {
  if (!Number.isFinite(stockCount) || stockCount <= 0) {
    return PRODUCT_AVAILABILITIES.UNAVAILABLE;
  }
  if (stockCount <= LIMITED_STOCK_THRESHOLD) {
    return PRODUCT_AVAILABILITIES.LIMITED;
  }
  return PRODUCT_AVAILABILITIES.IN_STOCK;
}

const AVAILABILITY_LABELS: Record<ProductAvailability, string> = {
  [PRODUCT_AVAILABILITIES.IN_STOCK]: 'In stock',
  [PRODUCT_AVAILABILITIES.LIMITED]: 'Limited stock',
  [PRODUCT_AVAILABILITIES.UNAVAILABLE]: 'Out of stock',
};

export function availabilityLabel(availability: ProductAvailability): string {
  return AVAILABILITY_LABELS[availability];
}
