import "server-only";
import crypto from "node:crypto";
import { kvDel, kvGet, kvSet } from "./kv.ts";
import { updateRecord } from "./notify-store.ts";

/**
 * Telegram through the Bot API directly: one bot for the app, one chat id per
 * person, no third party in between.
 *
 * LINKING. A `/start <payload>` payload is capped at 64 characters, shorter than
 * a Sui address, so the payload is a short random id that maps to the address
 * server-side for ten minutes. The person taps the deep link, presses Start, and
 * the id proves which signed-in session asked for it.
 */

const API = "https://api.telegram.org";
const LINK_TTL_S = 600;

const botToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim();
export const botUsername = () => process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
export const telegramConfigured = () => Boolean(botToken() && botUsername());

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
  if (!json.ok) {
    const err = new Error(`telegram ${method}: ${json.description ?? res.status}`) as Error & { code?: number };
    err.code = json.error_code;
    throw err;
  }
  return json.result as T;
}

export const sendTelegramMessage = (chatId: string, text: string) =>
  call("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });

/** Deep link the person opens to connect their chat. */
export async function createLink(address: string): Promise<string> {
  const id = crypto.randomBytes(16).toString("base64url");
  await kvSet(`tglink:${id}`, address.toLowerCase(), LINK_TTL_S);
  return `https://t.me/${botUsername()}?start=${id}`;
}

type Update = {
  update_id: number;
  message?: { text?: string; chat: { id: number; type: string } };
};

/** One update from either the webhook or getUpdates. Returns the address linked, if any. */
export async function handleUpdate(update: Update): Promise<string | null> {
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== "private") return null;
  const match = /^\/start\s+([A-Za-z0-9_-]{16,64})$/.exec(msg.text.trim());
  if (!match) return null;

  const address = await kvGet<string>(`tglink:${match[1]}`);
  if (!address) {
    await sendTelegramMessage(String(msg.chat.id), "That link has expired. Open Settings in Fuuud and connect again.").catch(() => {});
    return null;
  }
  await kvDel(`tglink:${match[1]}`);
  await updateRecord(address, (r) => ({ ...r, telegramChatId: String(msg.chat.id) }));
  await sendTelegramMessage(String(msg.chat.id), "Connected. Fuuud will message you here before each planned meal.").catch(() => {});
  return address;
}

/**
 * Local-development path: no public URL for a webhook, so fetch updates instead.
 * Telegram refuses getUpdates while a webhook is set (409); that means the
 * webhook is doing the job, so it is not an error here.
 */
export async function pollUpdates(): Promise<void> {
  const offset = (await kvGet<number>("tg:offset")) ?? 0;
  let updates: Update[];
  try {
    updates = await call<Update[]>("getUpdates", { offset, timeout: 0, allowed_updates: ["message"] });
  } catch (error) {
    if ((error as { code?: number }).code === 409) return;
    throw error;
  }
  for (const u of updates) {
    await handleUpdate(u).catch((e) => console.error("[fuuud] telegram update failed:", e));
    await kvSet("tg:offset", u.update_id + 1);
  }
}

/** Constant-time check of Telegram's webhook secret header. */
export function webhookSecretOk(header: string | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret || !header) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
