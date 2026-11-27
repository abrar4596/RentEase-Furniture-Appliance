import mongoose, { Schema, Document } from 'mongoose';
import { IOrder, DeliveryAddress, OrderItem } from '@rentease/shared';
import { ORDER_STATES, OrderState } from '@rentease/shared';

export interface IOrderDocument extends Document<mongoose.Types.ObjectId> {
  _id: mongoose.Types.ObjectId;
  renterId: mongoose.Types.ObjectId;
  items: OrderItem[];
  deliveryAddress: DeliveryAddress;
  preferredDeliveryDate: string;
  preferredDeliverySlot: 'morning' | 'afternoon' | 'evening';
  subtotalRentPaise: number;
  securityDepositPaise: number;
  totalUpfrontPaise: number;
  status: OrderState;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  kyc?: {
    documentType: 'AADHAR' | 'PAN' | 'DL' | 'PASSPORT' | 'VOTER_ID';
    documentNumber: string;
    frontDocument: { publicId: string; url: string };
    backDocument?: { publicId: string; url: string };
    submittedAt: Date;
    reviewedAt?: Date;
    reviewedBy?: mongoose.Types.ObjectId;
    rejectionReason?: string;
  };
  rentalStartAt?: Date;
  rentalEndAt?: Date;
  /** Optional photo taken by vendor as proof of delivery (uploaded to Cloudinary). */
  deliveryPhoto?: { publicId: string; url: string };
  maintenanceRequests: Array<{
    _id: mongoose.Types.ObjectId;
    description: string;
    photos: Array<{ publicId: string; url: string }>;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
    createdAt: Date;
    resolvedAt?: Date;
  }>;
  returnRequest?: {
    requestedAt: Date;
    preferredPickupDate: string;
    reason?: string;
    returnedAt?: Date;
  };
  damageClaim?: {
    description: string;
    photos: Array<{ publicId: string; url: string }>;
    deductedPaise: number;
    createdAt: Date;
    disputed?: boolean;
    arbitrationReason?: string;
    arbitratedAt?: Date;
    arbitratedBy?: mongoose.Types.ObjectId;
  };
  createdAt: Date;
  updatedAt: Date;
}

// These optional blocks are modelled as explicit subdocument schemas (rather than
// inline nested paths) because Mongoose materialises inline nested paths as empty
// objects. That made truthiness checks such as `if (order.returnRequest)` wrongly
// succeed on brand-new orders (and crashed formatting on missing fields). With a
// subdocument schema these paths stay `undefined` until they are actually set.
const kycSchema = new Schema(
  {
    documentType: { type: String, enum: ['AADHAR', 'PAN', 'DL', 'PASSPORT', 'VOTER_ID'] },
    documentNumber: String,
    frontDocument: { publicId: String, url: String },
    backDocument: { publicId: String, url: String },
    submittedAt: Date,
    reviewedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String,
  },
  { _id: false }
);

const returnRequestSchema = new Schema(
  {
    requestedAt: Date,
    preferredPickupDate: String,
    reason: String,
    returnedAt: Date,
  },
  { _id: false }
);

const damageClaimSchema = new Schema(
  {
    description: String,
    photos: [{ publicId: String, url: String }],
    deductedPaise: { type: Number, min: 0, default: 0 },
    createdAt: Date,
    disputed: { type: Boolean, default: false },
    arbitrationReason: String,
    arbitratedAt: Date,
    arbitratedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrderDocument>(
  {
    renterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        title: { type: String, required: true },
        vendorId: { type: Schema.Types.ObjectId, ref: 'VendorProfile', required: true },
        tenureMonths: { type: Number, enum: [1, 3, 6, 12], required: true },
        quantity: { type: Number, required: true, min: 1 },
        monthlyRentPaise: { type: Number, required: true, min: 1 },
        securityDepositPaise: { type: Number, required: true, min: 0 },
        lineTotalPaise: { type: Number, required: true, min: 0 },
      },
    ],
    deliveryAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      line1: { type: String, required: true },
      line2: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
    },
    preferredDeliveryDate: { type: String, required: true },
    preferredDeliverySlot: {
      type: String,
      enum: ['morning', 'afternoon', 'evening'],
      required: true,
    },
    subtotalRentPaise: { type: Number, required: true, min: 0 },
    securityDepositPaise: { type: Number, required: true, min: 0 },
    totalUpfrontPaise: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: Object.values(ORDER_STATES),
      default: ORDER_STATES.PENDING_PAYMENT,
      index: true,
    },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: String,
    razorpaySignature: String,
    kyc: kycSchema,
    rentalStartAt: Date,
    rentalEndAt: Date,
    deliveryPhoto: { publicId: String, url: String },
    maintenanceRequests: {
      type: [
        {
          description: { type: String, required: true },
          photos: [{ publicId: String, url: String }],
          status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED'], default: 'OPEN' },
          createdAt: { type: Date, default: Date.now },
          resolvedAt: Date,
        },
      ],
      default: [],
    },
    returnRequest: returnRequestSchema,
    damageClaim: damageClaimSchema,
  },
  { timestamps: true }
);

orderSchema.index({ renterId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'items.vendorId': 1, status: 1, createdAt: -1 });

function maskKycDocumentNumber(documentNumber: string): string {
  const normalized = documentNumber.trim();
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${'*'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}

export function formatOrder(doc: IOrderDocument): IOrder {
  return {
    id: doc._id.toString(),
    renterId: doc.renterId.toString(),
    items: doc.items.map((item) => ({
      ...item,
      productId: item.productId.toString(),
      vendorId: item.vendorId.toString(),
    })),
    deliveryAddress: doc.deliveryAddress,
    preferredDeliveryDate: doc.preferredDeliveryDate,
    preferredDeliverySlot: doc.preferredDeliverySlot,
    subtotalRentPaise: doc.subtotalRentPaise,
    securityDepositPaise: doc.securityDepositPaise,
    totalUpfrontPaise: doc.totalUpfrontPaise,
    status: doc.status,
    razorpayOrderId: doc.razorpayOrderId,
    razorpayPaymentId: doc.razorpayPaymentId,
    kyc:
      doc.kyc && doc.kyc.documentNumber
        ? {
            documentType: doc.kyc.documentType,
            documentNumber: maskKycDocumentNumber(doc.kyc.documentNumber),
            frontDocument: doc.kyc.frontDocument,
            backDocument: doc.kyc.backDocument,
            submittedAt: doc.kyc.submittedAt.toISOString(),
            reviewedAt: doc.kyc.reviewedAt?.toISOString(),
            reviewedBy: doc.kyc.reviewedBy?.toString(),
            rejectionReason: doc.kyc.rejectionReason,
          }
        : undefined,
    rentalStartAt: doc.rentalStartAt?.toISOString(),
    rentalEndAt: doc.rentalEndAt?.toISOString(),
    deliveryPhoto: doc.deliveryPhoto
      ? { publicId: doc.deliveryPhoto.publicId, url: doc.deliveryPhoto.url }
      : undefined,
    maintenanceRequests: (doc.maintenanceRequests || []).map((ticket) => ({
      id: ticket._id.toString(),
      description: ticket.description,
      photos: ticket.photos,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      resolvedAt: ticket.resolvedAt?.toISOString(),
    })),
    returnRequest: doc.returnRequest
      ? {
          requestedAt: doc.returnRequest.requestedAt.toISOString(),
          preferredPickupDate: doc.returnRequest.preferredPickupDate,
          reason: doc.returnRequest.reason,
          returnedAt: doc.returnRequest.returnedAt?.toISOString(),
        }
      : undefined,
    damageClaim: doc.damageClaim
      ? {
          description: doc.damageClaim.description,
          photos: doc.damageClaim.photos,
          deductedPaise: doc.damageClaim.deductedPaise,
          createdAt: doc.damageClaim.createdAt.toISOString(),
          disputed: doc.damageClaim.disputed,
          arbitrationReason: doc.damageClaim.arbitrationReason,
          arbitratedAt: doc.damageClaim.arbitratedAt?.toISOString(),
          arbitratedBy: doc.damageClaim.arbitratedBy?.toString(),
        }
      : undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const Order = mongoose.model<IOrderDocument>('Order', orderSchema);
