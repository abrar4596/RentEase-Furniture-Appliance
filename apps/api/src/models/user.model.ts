import mongoose, { Schema, Document } from 'mongoose';
import { USER_ROLES, UserRole, UserStatus, IUser } from '@rentease/shared';

export interface IUserDocument extends Document<mongoose.Types.ObjectId> {
  _id: mongoose.Types.ObjectId;
  email: string;
  name: string;
  phone?: string;
  passwordHash?: string;
  role: UserRole;
  status: UserStatus;
  authProviders: Array<{
    provider: 'local' | 'google';
    providerId?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: undefined,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.RENTER,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'pending_verification'],
      default: 'active',
    },
    authProviders: [
      {
        provider: {
          type: String,
          enum: ['local', 'google'],
          required: true,
        },
        providerId: {
          type: String,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export function formatUser(doc: IUserDocument): IUser {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    phone: doc.phone,
    role: doc.role,
    status: doc.status,
    authProviders: doc.authProviders,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const User = mongoose.model<IUserDocument>('User', userSchema);
