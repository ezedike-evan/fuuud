import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { getRecord } from "@/lib/notify-store.ts";
import { pollUpdates, telegramConfigured } from "@/lib/telegram.ts";
import { pushConfigured, vapidPublicKey } from "@/lib/push.ts";
import { buildPlanWeek } from "@/lib/plan-week.ts";
import { getGrant } from "@/lib/oauth/grants.ts";

/**
 * `?poll=1` also fetches Telegram updates first. That is the local-dev path (no
 * public webhook); with a webhook set it is a harmless no-op.
 */
async function getHandler(req: Request) {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });

  const poll = new URL(req.url).searchParams.get("poll") === "1";
  if (poll && telegramConfigured()) await pollUpdates().catch((e) => console.error("[fuuud] telegram poll:", e));

  const record = await getRecord(address);
  const chat = record?.telegramGrantId ? Boolean(await getGrant(record.telegramGrantId).catch(() => null)) : false;
  return Response.json({
    telegram: { configured: telegramConfigured(), linked: Boolean(record?.telegramChatId), chat },
    push: { configured: pushConfigured(), publicKey: vapidPublicKey() ?? null, subscribed: Boolean(record?.push) },
    pending: (record?.reminders ?? []).filter((r) => !r.sentAt).length,
    tz: record?.tz ?? null,
    // Where reminders will be sent from: anything stored here is plaintext meal names + times.
    stores: "chat id, push subscription, and scheduled meal names and times",
  });
}

/** Disconnect everything. Forgets the channels and every queued reminder. */
export async function DELETE() {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  const { saveRecord } = await import("@/lib/notify-store.ts");
  await saveRecord(address, { tz: 0, reminders: [] });
  return Response.json({ ok: true });
}

// Wrapped so the person's memory account is in scope (see inScope in lib/session.ts).
export const GET = (req: Request) => inScope(() => getHandler(req));
