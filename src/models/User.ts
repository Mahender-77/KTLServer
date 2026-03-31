import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: "user" | "admin" | "delivery";
  /** New RBAC relation (organization-scoped). Temporarily kept alongside legacy `role`. */
  roleId?: mongoose.Types.ObjectId;
  /** Set on every user after bootstrap; briefly unset only during first-user registration. */
  organizationId?: mongoose.Types.ObjectId;
  /** Platform operator; not tenant-scoped — use only for `/api/super-admin/*` and controlled bypasses. */
  isSuperAdmin?: boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, unique: true, sparse: true },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin", "delivery"],
      default: "user",
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      index: true,
    },
    isSuperAdmin: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Fix: Remove the 'next' parameter and don't call it
userSchema.pre("save", async function (this: IUser) {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (
  this: IUser,
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model<IUser>("User", userSchema);

export default User;