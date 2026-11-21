import mongoose, { Schema, Document } from 'mongoose';

export interface IPasswordResetTokenDocument extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetTokenDocument>(
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
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Automatic cleanup of expired tokens after TTL
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken = mongoose.model<IPasswordResetTokenDocument>(
  'PasswordResetToken',
  passwordResetTokenSchema
);
