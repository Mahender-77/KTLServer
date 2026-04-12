import mongoose, { Schema, Document } from "mongoose";

export type PushPlatform = "ios" | "android" | "web";

export interface IPushToken extends Document {
  userId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  token: string;
  platform: PushPlatform;
  createdAt: Date;
}

const pushTokenSchema = new Schema<IPushToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ["ios", "android", "web"] satisfies PushPlatform[],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pushTokenSchema.index({ organizationId: 1, userId: 1 });

const PushToken = mongoose.model<IPushToken>("PushToken", pushTokenSchema);

export default PushToken;
