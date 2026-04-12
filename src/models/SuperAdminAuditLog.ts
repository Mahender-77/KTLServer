import mongoose, { Schema, Document } from "mongoose";

export interface ISuperAdminAuditLog extends Document {
  action: string;
  actorUserId: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId | null;
  metadata: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

const superAdminAuditLogSchema = new Schema<ISuperAdminAuditLog>(
  {
    action: { type: String, required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      index: true,
      sparse: true,
      default: null,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

superAdminAuditLogSchema.index({ createdAt: -1 });

export default mongoose.model<ISuperAdminAuditLog>(
  "SuperAdminAuditLog",
  superAdminAuditLogSchema
);
