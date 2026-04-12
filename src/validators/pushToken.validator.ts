import { z } from "zod";

export const registerPushTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1, "token is required"),
    platform: z.enum(["ios", "android", "web"]),
  }),
});

export const unregisterPushTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1, "token is required"),
  }),
});
