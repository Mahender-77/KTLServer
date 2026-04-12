import Expo, { type ExpoPushMessage } from "expo-server-sdk";
import { logger } from "../utils/logger";

const accessToken = process.env.EXPO_ACCESS_TOKEN;
const expo = accessToken ? new Expo({ accessToken }) : new Expo();

export type PushPayload = Record<string, unknown>;

export function isExpoPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}

export async function sendToMultipleTokens(
  tokens: string[],
  title: string,
  body: string,
  data: PushPayload = {}
): Promise<{ invalidTokens: string[] }> {
  const validTokens = tokens.filter((token) => typeof token === "string" && isExpoPushToken(token));
  if (validTokens.length === 0) {
    logger.warn("[push] sendToMultipleTokens: no valid Expo tokens");
    return { invalidTokens: [] };
  }

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound: "default",
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const invalidTokens: string[] = [];

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, index) => {
        if (ticket.status !== "error") return;
        const code = ticket.details?.error;
        const toField = chunk[index]?.to;
        const fallbackToken = Array.isArray(toField) ? toField[0] : toField;
        const fromTicket = ticket.details?.expoPushToken;
        const targetToken = fromTicket ?? (typeof fallbackToken === "string" ? fallbackToken : null);
        if (!targetToken) return;
        if (code === "DeviceNotRegistered" || /DeviceNotRegistered/i.test(ticket.message ?? "")) {
          invalidTokens.push(targetToken);
        }
      });
    } catch (error) {
      logger.error("[push] chunk send failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { invalidTokens: [...new Set(invalidTokens)] };
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data: PushPayload = {}
): Promise<{ invalidTokens: string[] }> {
  return sendToMultipleTokens([token], title, body, data);
}
