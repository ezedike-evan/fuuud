import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { buildPlanWeek } from "@/lib/plan-week.ts";
import { buildIcs } from "@/lib/ics.ts";

/**
 * The plan as a calendar file. Only meals that pass the screen RIGHT NOW are
 * exported: a file leaves the app and cannot be recalled when the record changes.
 */
async function getHandler() {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  const week = await buildPlanWeek(address);
  // Never export a calendar built from a record we could not read.
  if (week.unavailable) return new Response(week.unavailable.message, { status: 503 });
  const safe = week.meals.filter((m) => m.safe);
  if (!safe.length) return new Response("Nothing safe to export yet.", { status: 404 });
  return new Response(buildIcs(safe), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="fuuud-week.ics"',
      "cache-control": "no-store",
    },
  });
}

// Wrapped so the person's memory account is in scope (see inScope in lib/session.ts).
export const GET = () => inScope(() => getHandler());
