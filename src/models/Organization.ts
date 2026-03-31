import mongoose, { Schema, Document } from "mongoose";
import { DEFAULT_ORG_MODULES } from "../constants/modules";
import { DEFAULT_PRODUCT_FIELD_CONFIG } from "../constants/productFields";
import Plan from "./Plan";

export const SUBSCRIPTION_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  TRIAL: "trial",
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

export interface IOrganization extends Document {
  name: string;
  owner: mongoose.Types.ObjectId;
  isActive: boolean;
  /** Enabled feature modules for this tenant (e.g. product, order). */
  modules: string[];
  productFieldConfig: Record<string, boolean>;
  planId?: mongoose.Types.ObjectId;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStartDate?: Date;
  subscriptionEndDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isActive: { type: Boolean, default: true },
    modules: {
      type: [String],
      default: () => [...DEFAULT_ORG_MODULES],
    },
    productFieldConfig: {
      type: Object,
      default: () => ({ ...DEFAULT_PRODUCT_FIELD_CONFIG }),
    },
    planId: { type: Schema.Types.ObjectId, ref: "Plan", index: true },
    subscriptionStatus: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.TRIAL,
      index: true,
    },
    subscriptionStartDate: { type: Date },
    subscriptionEndDate: { type: Date, index: true },
  },
  { timestamps: true }
);

organizationSchema.index({ name: 1 });
organizationSchema.index({ isActive: 1 });

// Billing rule: when plan is set, organization.modules must come from plan.modules.
organizationSchema.pre("save", async function () {
  if (!this.planId) return;
  const plan = await Plan.findById(this.planId).select("modules isActive").lean();
  if (!plan || plan.isActive !== true) return;
  this.set("modules", Array.isArray(plan.modules) ? plan.modules : []);
});

export default mongoose.model<IOrganization>("Organization", organizationSchema);
