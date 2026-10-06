import crypto from "node:crypto";
import { runDueReminders } from "@/lib/reminder-runner.ts";

export const maxDuration = 60;

/**
 * Called by .github/workflows/reminders.yml. Requires
 * `Authorization: Bearer $CRON_SECRET`; anything else gets a 403.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok = secret && given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response("forbidden", { status: 403 });
  return Response.json(await runDueReminders());
}
