import mongoose, { Schema, Document } from 'mongoose';

export interface IRefreshTokenDocument extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  family: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    family: {
      type: String,
      required: true,
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Automatic cleanup of expired tokens via MongoDB TTL index
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<IRefreshTokenDocument>(
  'RefreshToken',
  refreshTokenSchema
);
