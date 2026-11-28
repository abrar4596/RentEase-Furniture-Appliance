import mongoose, { Schema, Document } from 'mongoose';
import { ICity } from '@rentease/shared';

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

/**
 * Public projection of a city. Exposes the stable `id` (never the raw `_id`)
 * so API consumers match the shared `ICity` contract.
 */
export function formatCity(doc: ICityDocument): ICity {
  return {
    id: doc._id.toString(),
    name: doc.name,
    state: doc.state,
    pincodes: doc.pincodes,
    isActive: doc.isActive,
  };
}
