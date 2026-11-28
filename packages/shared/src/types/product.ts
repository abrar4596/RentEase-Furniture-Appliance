import {
  ProductCategory,
  ProductCondition,
  ProductStatus,
  SupportedTenureMonths,
} from '../constants/categories.js';
import { ProductAvailability } from '../constants/catalog.js';
import { Paise } from '../utils/money.js';

export interface ProductImage {
  publicId: string;
  url: string;
  thumbnailUrl?: string;
}

export interface TenureTier {
  tenureMonths: SupportedTenureMonths;
  monthlyRentPaise: Paise;
}

export interface IProduct {
  id: string;
  vendorId: string;
  vendorBusinessName?: string;
  cityId: string;
  cityName?: string;
  category: ProductCategory;
  subcategory: string;
  title: string;
  description: string;
  specs: Record<string, string>;
  images: ProductImage[];
  condition: ProductCondition;
  stockCount: number;
  securityDepositPaise: Paise;
  tenureTiers: TenureTier[];
  /** Lowest monthly rent across all tiers; the "from ₹X /month" catalog price. */
  startingRentPaise: Paise;
  deliveryLeadTimeHours: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Renter-facing projection of a product.
 *
 * Deliberately omits `stockCount` so exact vendor stock levels are never exposed;
 * renters only ever see a derived `availability` bucket.
 */
export type IPublicProduct = Omit<IProduct, 'stockCount'> & {
  availability: ProductAvailability;
};
