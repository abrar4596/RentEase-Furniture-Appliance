import mongoose, { Schema, Document } from 'mongoose';

export interface IInventoryLockDocument extends Document<mongoose.Types.ObjectId> {
  productId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  quantity: number;
  expiresAt: Date;
  released: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const inventoryLockSchema = new Schema<IInventoryLockDocument>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    quantity: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true, index: true },
    released: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

inventoryLockSchema.index({ expiresAt: 1, released: 1 });

export const InventoryLock = mongoose.model<IInventoryLockDocument>(
  'InventoryLock',
  inventoryLockSchema
);
