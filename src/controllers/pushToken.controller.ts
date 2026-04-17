import { Response } from "express";
import mongoose from "mongoose";
import PushToken from "../models/PushToken.js";
import User from "../models/User.js";
import { AuthRequest } from "../middlewares/auth.middleware.js";
import { requestActor } from "../utils/requestActor.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

/**
 * POST /api/push/token — register or replace Expo push token for the authenticated user (tenant-scoped).
 */
export const registerToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const actor = requestActor(req);
  const { token, platform } = req.body as { token: string; platform: string };
  const trimmedToken = token.trim();

  const userId = new mongoose.Types.ObjectId(actor.userId);
  const organizationId = new mongoose.Types.ObjectId(actor.organizationId);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Safe ownership transfer: if this token exists, bind it to current actor.
      await PushToken.updateMany(
        { token: trimmedToken },
        { $set: { userId, organizationId, platform } },
        { session }
      );

      // Keep a single active token per user to avoid stale device tokens.
      await PushToken.deleteMany(
        {
          userId,
          token: { $ne: trimmedToken },
        },
        { session }
      );

      // Ensure current token exists for this user.
      await PushToken.updateOne(
        { userId, token: trimmedToken },
        {
          $set: { organizationId, platform },
        },
        { upsert: true, runValidators: true, session }
      );

      await User.updateOne({ _id: userId }, { $set: { expoPushToken: trimmedToken } }, { session });
    });
  } finally {
    await session.endSession();
  }

  logger.info("[push] token registered", {
    userId: actor.userId,
    organizationId: actor.organizationId,
  });

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
