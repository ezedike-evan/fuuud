import { after } from "next/server";
import { handleUpdate, isLinkStart, webhookSecretOk, type Update } from "@/lib/telegram.ts";
import { handleChatUpdate } from "@/lib/telegram-chat.ts";

// A chat turn recalls, calls a model, and may follow a Walrus write to its end.
export const maxDuration = 300;

/**
 * Register once:
 *   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
 *     -d url=https://<your-origin>/api/telegram/webhook \
 *     -d secret_token=$TELEGRAM_WEBHOOK_SECRET
 * Telegram echoes the secret in X-Telegram-Bot-Api-Secret-Token; anything
 * without it is not from Telegram. Use the origin that does NOT redirect:
 * Telegram does not follow a 308.
 */
export async function POST(req: Request) {
  if (!webhookSecretOk(req.headers.get("x-telegram-bot-api-secret-token"))) return new Response("forbidden", { status: 403 });
  try {
    const update = (await req.json()) as Update;
    if (isLinkStart(update)) {
      await handleUpdate(update);
    } else {
      // Answer Telegram at once and keep working after the response: a non-2xx or a slow
      // reply makes Telegram redeliver the update.
      after(() => handleChatUpdate(update));
    }
  } catch (error) {
    // Always 200: a non-2xx makes Telegram retry the same update for hours.
    console.error("[fuuud] telegram webhook:", error);
  }
  return Response.json({ ok: true });
}
