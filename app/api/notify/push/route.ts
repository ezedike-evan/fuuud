import { getOwnerAddress } from "@/lib/session.ts";
import { updateRecord } from "@/lib/notify-store.ts";
import { isSubscription } from "@/lib/push.ts";
import { buildPlanWeek } from "@/lib/plan-week.ts";

export async function POST(req: Request) {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  const { subscription, tz } = (await req.json().catch(() => ({}))) as { subscription?: unknown; tz?: unknown };
  if (!isSubscription(subscription)) return new Response("A push subscription is required.", { status: 400 });
  await updateRecord(address, (r) => ({ ...r, push: subscription, tz: typeof tz === "number" ? tz : r.tz }));
  // Queue reminders straight away rather than at the next calendar visit.
  await buildPlanWeek(address).catch((e) => console.error("[fuuud] sync after subscribe:", e));
  return Response.json({ ok: true });
}

export async function DELETE() {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  await updateRecord(address, ({ push: _drop, ...rest }) => rest);
  return Response.json({ ok: true });
}
