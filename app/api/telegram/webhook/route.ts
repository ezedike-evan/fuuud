import { handleUpdate, webhookSecretOk } from "@/lib/telegram.ts";

/**
 * Register once:
 *   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
 *     -d url=https://<your-origin>/api/telegram/webhook \
 *     -d secret_token=$TELEGRAM_WEBHOOK_SECRET
 * Telegram echoes the secret in X-Telegram-Bot-Api-Secret-Token; anything
 * without it is not from Telegram.
 */
export async function POST(req: Request) {
  if (!webhookSecretOk(req.headers.get("x-telegram-bot-api-secret-token"))) return new Response("forbidden", { status: 403 });
  try {
    await handleUpdate(await req.json());
  } catch (error) {
    // Always 200: a non-2xx makes Telegram retry the same update for hours.
    console.error("[fuuud] telegram webhook:", error);
  }
  return Response.json({ ok: true });
}
