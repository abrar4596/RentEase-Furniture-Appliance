import mongoose, { Document, Schema } from 'mongoose';
import { IAuditEvent } from '@rentease/shared';

export interface IAuditDocument extends Document<mongoose.Types.ObjectId> {
  actorId: mongoose.Types.ObjectId;
  action: string;
  entityType: 'vendor' | 'kyc' | 'order' | 'city' | 'settings' | 'payout' | 'support';
  entityId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const auditSchema = new Schema<IAuditDocument>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    entityType: {
      type: String,
      enum: ['vendor', 'kyc', 'order', 'city', 'settings', 'payout', 'support'],
      required: true,
      index: true,
    },
    entityId: { type: String, required: true, index: true },
    reason: String,
    metadata: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

auditSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export function formatAudit(doc: IAuditDocument): IAuditEvent {
  return {
    id: doc._id.toString(),
    actorId: doc.actorId.toString(),
    actorRole: 'admin',
    action: doc.action,
    entityType: doc.entityType,
    entityId: doc.entityId,
    reason: doc.reason,
    metadata: doc.metadata,
    createdAt: doc.createdAt.toISOString(),
  };
}

export const AuditEvent = mongoose.model<IAuditDocument>('AuditEvent', auditSchema);
