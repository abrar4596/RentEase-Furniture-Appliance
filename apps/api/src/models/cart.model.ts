import mongoose, { Schema, Document } from 'mongoose';
import { DeliveryAddress } from '@rentease/shared';

export interface ICartItemDocument {
  productId: mongoose.Types.ObjectId;
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
  userId: mongoose.Types.ObjectId;
  items: ICartItemDocument[];
  deliveryAddress?: DeliveryAddress;
  preferredDeliveryDate?: string;
  preferredDeliverySlot?: 'morning' | 'afternoon' | 'evening';
  createdAt: Date;
  updatedAt: Date;
}

const cartSchema = new Schema<ICartDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
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
  },
  { timestamps: true }
);

export const Cart = mongoose.model<ICartDocument>('Cart', cartSchema);
