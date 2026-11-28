import mongoose, { Schema, Document } from 'mongoose';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  PRODUCT_STATUSES,
  ProductCategory,
  ProductCondition,
  ProductStatus,
  IProduct,
  IPublicProduct,
  ProductImage,
  TenureTier,
  deriveAvailability,
} from '@rentease/shared';

export interface IProductDocument extends Document<mongoose.Types.ObjectId> {
  _id: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId;
  cityId: mongoose.Types.ObjectId;
  category: ProductCategory;
  subcategory: string;
  title: string;
  description: string;
  specs: Record<string, string>;
  images: ProductImage[];
  condition: ProductCondition;
  stockCount: number;
  securityDepositPaise: number;
  tenureTiers: TenureTier[];
  startingRentPaise: number;
  deliveryLeadTimeHours: number;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProductDocument>(
  {
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'VendorProfile',
      required: true,
      index: true,
    },
    cityId: {
      type: Schema.Types.ObjectId,
      ref: 'City',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: Object.values(PRODUCT_CATEGORIES),
      required: true,
      index: true,
    },
    subcategory: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    specs: {
      type: Map,
      of: String,
      default: {},
    },
    images: [
      {
        publicId: { type: String, required: true },
        url: { type: String, required: true },
        thumbnailUrl: { type: String },
      },
    ],
    condition: {
      type: String,
      enum: Object.values(PRODUCT_CONDITIONS),
      default: PRODUCT_CONDITIONS.LIKE_NEW,
    },
    stockCount: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    securityDepositPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    tenureTiers: [
      {
        tenureMonths: { type: Number, required: true },
        monthlyRentPaise: { type: Number, required: true },
      },
    ],
    // Derived: lowest monthly rent across tiers. Kept as a stored field so the
    // catalog can filter/sort on price using a single index.
    startingRentPaise: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      index: true,
    },
    deliveryLeadTimeHours: {
      type: Number,
      default: 48,
    },
    status: {
      type: String,
      enum: Object.values(PRODUCT_STATUSES),
      default: PRODUCT_STATUSES.DRAFT,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Derive `startingRentPaise` before validation so the "from ₹X /month" price is
// always in sync with the vendor's configured tenure tiers.
productSchema.pre('validate', function (next) {
  const rents = (this.tenureTiers ?? [])
    .map((tier) => tier.monthlyRentPaise)
    .filter((rent) => Number.isFinite(rent) && rent > 0);
  this.startingRentPaise = rents.length > 0 ? Math.min(...rents) : 0;
  next();
});

// Composite indexes for catalog search & vendor dashboard
productSchema.index({ cityId: 1, status: 1, category: 1 });
productSchema.index({ cityId: 1, status: 1, category: 1, startingRentPaise: 1 });
productSchema.index({ status: 1, startingRentPaise: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ vendorId: 1, status: 1 });

export function formatProduct(
  doc: IProductDocument,
  vendorBusinessName?: string,
  cityName?: string
): IProduct {
  const specsObject: Record<string, string> = {};
  if (doc.specs instanceof Map) {
    doc.specs.forEach((val, key) => {
      specsObject[key] = val;
    });
  } else if (doc.specs && typeof doc.specs === 'object') {
    Object.assign(specsObject, doc.specs);
  }

  return {
    id: doc._id.toString(),
    vendorId: doc.vendorId.toString(),
    vendorBusinessName,
    cityId: doc.cityId.toString(),
    cityName,
    category: doc.category,
    subcategory: doc.subcategory,
    title: doc.title,
    description: doc.description,
    specs: specsObject,
    images: doc.images,
    condition: doc.condition,
    stockCount: doc.stockCount,
    securityDepositPaise: doc.securityDepositPaise,
    tenureTiers: doc.tenureTiers,
    startingRentPaise: resolveStartingRent(doc),
    deliveryLeadTimeHours: doc.deliveryLeadTimeHours,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function resolveStartingRent(doc: IProductDocument): number {
  if (Number.isFinite(doc.startingRentPaise) && doc.startingRentPaise > 0) {
    return doc.startingRentPaise;
  }
  const rents = (doc.tenureTiers ?? []).map((tier) => tier.monthlyRentPaise);
  return rents.length > 0 ? Math.min(...rents) : 0;
}

/**
 * Projects a full product into its renter-facing shape, dropping the raw
 * `stockCount` and replacing it with a derived availability bucket.
 */
export function toPublicProduct(product: IProduct): IPublicProduct {
  const { stockCount, ...rest } = product;
  return { ...rest, availability: deriveAvailability(stockCount) };
}

export const Product = mongoose.model<IProductDocument>('Product', productSchema);
