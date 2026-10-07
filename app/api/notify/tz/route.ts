import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { getRecord, updateRecord } from "@/lib/notify-store.ts";
import { buildPlanWeek } from "@/lib/plan-week.ts";

/** The browser reports its offset; reminders are computed from it. Rebuilds the schedule when it changes. */
async function postHandler(req: Request) {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  const { tz } = (await req.json().catch(() => ({}))) as { tz?: unknown };
  if (typeof tz !== "number" || !Number.isFinite(tz) || Math.abs(tz) > 14 * 60) return new Response("tz must be minutes, within +/-14h", { status: 400 });

  const existing = await getRecord(address);
  if (!existing) return Response.json({ ok: true, stored: false }); // no channel yet: keep nothing
  if (existing.tz !== tz) {
    await updateRecord(address, (r) => ({ ...r, tz }));
    await buildPlanWeek(address).catch(() => {});
  }
  return Response.json({ ok: true, stored: true });
}

// Wrapped so the person's memory account is in scope (see inScope in lib/session.ts).
export const POST = (req: Request) => inScope(() => postHandler(req));
