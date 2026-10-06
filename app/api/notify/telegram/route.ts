import { getOwnerAddress } from "@/lib/session.ts";
import { createLink, telegramConfigured } from "@/lib/telegram.ts";
import { updateRecord } from "@/lib/notify-store.ts";

/** Start linking: returns the t.me deep link for this signed-in person. */
export async function POST() {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  if (!telegramConfigured()) return new Response("TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME are not set.", { status: 503 });
  return Response.json({ url: await createLink(address) });
}

/** Unlink Telegram only. */
export async function DELETE() {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  await updateRecord(address, ({ telegramChatId: _drop, ...rest }) => rest);
  return Response.json({ ok: true });
}
