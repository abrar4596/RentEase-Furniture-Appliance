import mongoose, { Schema, Document } from 'mongoose';
import { DeliveryAddress, DeliverySlot } from '@rentease/shared';

export interface ICartItemDocument {
  productId: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId;
  vendorBusinessName?: string;
  tenureMonths: number;
  quantity: number;
  monthlyRentPaise: number;
  securityDepositPaise: number;
  unit: 'month';
  title?: string;
  imageUrl?: string;
}

export interface ICartDocument extends Document<mongoose.Types.ObjectId> {
  _id: mongoose.Types.ObjectId;
  /** Set for authenticated renter carts. */
  userId?: mongoose.Types.ObjectId;
  /** Set for anonymous (device-cookie) guest carts. */
  guestId?: string;
  items: ICartItemDocument[];
  deliveryAddress?: DeliveryAddress;
  preferredDeliveryDate?: string;
  preferredDeliverySlot?: DeliverySlot;
  /** TTL marker for guest carts so abandoned anonymous carts self-expire. */
  guestExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const cartSchema = new Schema<ICartDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    guestId: { type: String },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        vendorId: { type: Schema.Types.ObjectId, ref: 'VendorProfile', required: true },
        vendorBusinessName: String,
        tenureMonths: { type: Number, enum: [1, 3, 6, 12], required: true },
        quantity: { type: Number, required: true, min: 1 },
        monthlyRentPaise: { type: Number, required: true, min: 1 },
        securityDepositPaise: { type: Number, required: true, min: 0 },
        unit: { type: String, enum: ['month'], default: 'month' },
        title: String,
        imageUrl: String,
      },
    ],
    deliveryAddress: {
      fullName: String,
      phone: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },
    preferredDeliveryDate: String,
    preferredDeliverySlot: { type: String, enum: ['morning', 'afternoon', 'evening'] },
    guestExpiresAt: { type: Date },
  },
  { timestamps: true }
);

// A cart belongs to exactly one owner: a user OR a device (guest). Sparse unique
// indexes keep both lookups collision-free while allowing the other key to be absent.
cartSchema.index({ userId: 1 }, { unique: true, sparse: true });
cartSchema.index({ guestId: 1 }, { unique: true, sparse: true });
// Abandoned guest carts are purged automatically.
cartSchema.index({ guestExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const Cart = mongoose.model<ICartDocument>('Cart', cartSchema);
