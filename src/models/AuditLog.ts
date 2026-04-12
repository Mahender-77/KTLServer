import mongoose, { Schema, Document } from "mongoose";

/**
 * Immutable domain audit trail (tenant-scoped). Append-only via `auditLog.service` — no updates/deletes.
 */
export interface IAuditLog extends Document {
  organizationId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
      sparse: true,
    },
    action: { type: String, required: true, index: true, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ organizationId: 1, createdAt: -1 });

export default mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
