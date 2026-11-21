import mongoose, { Document, Schema } from 'mongoose';

export interface IWebhookEventDocument extends Document<mongoose.Types.ObjectId> {
  eventId: string;
  event: string;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEventDocument>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    event: { type: String, required: true },
    processedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

export const WebhookEvent = mongoose.model<IWebhookEventDocument>(
  'WebhookEvent',
  webhookEventSchema
);
