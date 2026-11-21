export const PRODUCT_CATEGORIES = {
  FURNITURE: 'furniture',
  APPLIANCES: 'appliances',
} as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[keyof typeof PRODUCT_CATEGORIES];

export const FURNITURE_SUBCATEGORIES = [
  'Beds & Mattresses',
  'Sofas & Seating',
  'Study Tables & Desks',
  'Wardrobes & Storage',
  'Chairs',
  'Dining Sets',
] as const;

export const APPLIANCE_SUBCATEGORIES = [
  'Refrigerators',
  'Washing Machines',
  'Microwaves',
  'Televisions',
  'Air Coolers & ACs',
  'Water Purifiers',
] as const;

export const PRODUCT_CONDITIONS = {
  BRAND_NEW: 'brand_new',
  LIKE_NEW: 'like_new',
  REFURBISHED: 'refurbished',
} as const;

export type ProductCondition = (typeof PRODUCT_CONDITIONS)[keyof typeof PRODUCT_CONDITIONS];

export const PRODUCT_STATUSES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
} as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[keyof typeof PRODUCT_STATUSES];

export const VENDOR_STATUSES = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;

export type VendorStatus = (typeof VENDOR_STATUSES)[keyof typeof VENDOR_STATUSES];

export const SUPPORTED_TENURE_MONTHS = [1, 3, 6, 12] as const;
export type SupportedTenureMonths = (typeof SUPPORTED_TENURE_MONTHS)[number];
