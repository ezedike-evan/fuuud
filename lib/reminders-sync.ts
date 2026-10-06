import "server-only";
import { buildReminders, type Reminder } from "./reminders.ts";
import { getRecord, hasChannel, saveRecord } from "./notify-store.ts";
import type { ScreenedMeal } from "./plan.ts";

/**
 * Rebuild one person's reminder schedule from the plan as screened RIGHT NOW.
 *
 * Called from getPlanWeek, which runs on every calendar load, after every plan
 * change, and after any chat turn that wrote a new fact. That is the sweep: tell
 * the agent about a groundnut allergy and the next read cancels every reminder
 * that names groundnut, before the cron job can send it.
 *
 * Does nothing for someone with no channel connected, so no meal names are kept
 * for people who never asked for reminders.
 */
export async function syncReminders(address: string, meals: ScreenedMeal[]): Promise<{ scheduled: number; cancelled: Reminder[] }> {
  const record = await getRecord(address);
  if (!record || !hasChannel(record)) return { scheduled: 0, cancelled: [] };
  const { reminders, cancelled } = buildReminders(meals, record.tz, record.reminders);
  await saveRecord(address, { ...record, reminders });
  return { scheduled: reminders.filter((r) => !r.sentAt).length, cancelled };
}
