import mongoose, { Schema, Document } from 'mongoose';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  PRODUCT_STATUSES,
  ProductCategory,
  ProductCondition,
  ProductStatus,
  IProduct,
  ProductImage,
  TenureTier,
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

// Composite indexes for catalog search & vendor dashboard
productSchema.index({ cityId: 1, status: 1, category: 1 });
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
    deliveryLeadTimeHours: doc.deliveryLeadTimeHours,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const Product = mongoose.model<IProductDocument>('Product', productSchema);
