import { Response } from "express";
import mongoose from "mongoose";
import PushToken from "../models/PushToken";
import User from "../models/User";
import { AuthRequest } from "../middlewares/auth.middleware";
import { requestActor } from "../utils/requestActor";
import { AppError } from "../utils/AppError";

/**
 * POST /api/push/token — register or replace Expo push token for the authenticated user (tenant-scoped).
 */
export const registerToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const actor = requestActor(req);
  const { token, platform } = req.body as { token: string; platform: string };

  const userId = new mongoose.Types.ObjectId(actor.userId);
  const organizationId = new mongoose.Types.ObjectId(actor.organizationId);

  await PushToken.findOneAndUpdate(
    { token: token.trim() },
    {
      $set: {
        userId,
        organizationId,
        platform,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
  await User.updateOne({ _id: userId }, { $set: { expoPushToken: token.trim() } });

  res.status(200).json({ success: true, message: "Push token registered" });
};

/**
 * DELETE /api/push/token — remove a specific token for the authenticated user (tenant-scoped).
 */
export const unregisterToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const actor = requestActor(req);
  const { token } = req.body as { token: string };

  const result = await PushToken.deleteOne({
    token: token.trim(),
    userId: actor.userId,
    organizationId: actor.organizationId,
  });

  if (result.deletedCount === 0) {
    throw new AppError("Push token not found", 404, "PUSH_TOKEN_NOT_FOUND");
  }
  await User.updateOne({ _id: actor.userId, expoPushToken: token.trim() }, { $set: { expoPushToken: null } });

  res.status(200).json({ success: true, message: "Push token removed" });
};
