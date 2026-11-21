import {
  ProductCategory,
  ProductCondition,
  ProductStatus,
  SupportedTenureMonths,
} from '../constants/categories.js';
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
  deliveryLeadTimeHours: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}
