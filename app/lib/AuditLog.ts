import mongoose, { Model, Schema, Types } from 'mongoose';

export type AuditEntityType = 'RESERVATION' | 'PAYMENT' | 'USER' | 'ROOM' | 'PROMO' | 'ADD_ON' | 'RATE_SETTINGS';
export type AuditActorRole = 'OWNER' | 'STAFF' | 'CUSTOMER' | 'SYSTEM';
export type AuditFieldChange = {
  field: string;
  before: string;
  after: string;
};

export interface IAuditLog {
  _id?: Types.ObjectId;
  actorId?: string;
  actorName: string;
  actorEmployeeId?: string;
  actorRole: AuditActorRole;
  action: string;
  entityType: AuditEntityType;
  entityId?: string;
  entityLabel: string;
  summary: string;
  changedFields?: Array<string | AuditFieldChange>;
  createdAt?: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: String, trim: true },
    actorName: { type: String, required: true, trim: true },
    actorEmployeeId: { type: String, trim: true },
    actorRole: { type: String, required: true, enum: ['OWNER', 'STAFF', 'CUSTOMER', 'SYSTEM'] },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, enum: ['RESERVATION', 'PAYMENT', 'USER', 'ROOM', 'PROMO', 'ADD_ON', 'RATE_SETTINGS'] },
    entityId: { type: String, trim: true },
    entityLabel: { type: String, required: true, trim: true },
    summary: { type: String, required: true, trim: true },
    changedFields: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_logs' }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

const AuditLog: Model<IAuditLog> = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;