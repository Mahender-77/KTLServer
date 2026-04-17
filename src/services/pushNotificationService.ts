import Expo, { type ExpoPushMessage } from "expo-server-sdk";
import { logger } from "../utils/logger.js";

const accessToken = process.env.EXPO_ACCESS_TOKEN;
const expo = accessToken ? new Expo({ accessToken }) : new Expo();

export type PushPayload = Record<string, unknown>;

/** Expo / FCM expect string values in `data` for reliable Android delivery. */
function stringifyDataPayload(data: PushPayload): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

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

  const dataStrings = stringifyDataPayload(data);

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    title,
    body,
    data: dataStrings,
    sound: "default",
    priority: "high",
    channelId: "default",
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const invalidTokens: string[] = [];

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, index) => {
        if (ticket.status === "ok") {
          logger.info("[push] Expo push ticket ok", {
            id: "id" in ticket ? ticket.id : undefined,
          });
          return;
        }
        const code = ticket.details?.error;
        const toField = chunk[index]?.to;
        const fallbackToken = Array.isArray(toField) ? toField[0] : toField;
        const fromTicket = ticket.details?.expoPushToken;
        const targetToken = fromTicket ?? (typeof fallbackToken === "string" ? fallbackToken : null);

        logger.warn("[push] Expo push ticket error", {
          message: ticket.message,
          code: code ?? ticket.message,
          details: ticket.details,
          tokenSuffix: targetToken ? `…${targetToken.slice(-12)}` : undefined,
        });

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
