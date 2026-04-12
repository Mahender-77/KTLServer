import mongoose, { Schema, Document } from "mongoose";

export interface IRole extends Document {
  name: string;
  organizationId: mongoose.Types.ObjectId;
  permissions: string[];
  isActive: boolean;
}

const roleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, trim: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    permissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });
roleSchema.index({ organizationId: 1, isActive: 1 });

const Role = mongoose.model<IRole>("Role", roleSchema);
export default Role;

