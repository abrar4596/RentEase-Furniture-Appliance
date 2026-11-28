import mongoose, { Schema, Document } from 'mongoose';

export interface IInventoryLockDocument extends Document<mongoose.Types.ObjectId> {
  productId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  quantity: number;
  /** When the pending reservation lapses and stock should be returned. */
  expiresAt: Date;
  /** Stock has been returned to the product (expiry, cancel, refund, failed payment). */
  released: boolean;
  /**
   * The reservation was paid for and converted into a firm allocation. Committed
   * locks are never swept or TTL-reclaimed; their stock is released only when the
   * order itself is cancelled or refunded.
   */
  committed: boolean;
  releasedAt?: Date;
  /**
   * Housekeeping marker: set once a lock is finalised (released or committed) so
   * MongoDB reclaims the row. Live reservations leave this unset, guaranteeing the
   * TTL index can never delete a reservation before its stock has been returned.
   */
  purgeAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inventoryLockSchema = new Schema<IInventoryLockDocument>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    quantity: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true },
    released: { type: Boolean, default: false },
    committed: { type: Boolean, default: false },
    releasedAt: { type: Date },
    purgeAt: { type: Date },
  },
  { timestamps: true }
);

// The sweeper scans only live, uncommitted reservations that have lapsed.
inventoryLockSchema.index({ released: 1, committed: 1, expiresAt: 1 });
// Rows are reclaimed only after they are finalised (purgeAt is unset while live),
// so TTL cleanup can never race the stock-returning sweeper.
inventoryLockSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const InventoryLock = mongoose.model<IInventoryLockDocument>(
  'InventoryLock',
  inventoryLockSchema
);
