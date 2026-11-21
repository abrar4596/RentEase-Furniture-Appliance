import mongoose, { Schema, Document } from 'mongoose';

export interface ICityDocument extends Document<mongoose.Types.ObjectId> {
  _id: mongoose.Types.ObjectId;
  name: string;
  state: string;
  pincodes: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const citySchema = new Schema<ICityDocument>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    pincodes: {
      type: [String],
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const City = mongoose.model<ICityDocument>('City', citySchema);
