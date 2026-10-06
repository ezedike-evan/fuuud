/**
 * Pure reminder algebra - no I/O, no SDK. Turns a SCREENED meal plan into the
 * list of nudges a scheduler will send.
 *
 * Only meals that currently pass the allergen screen become reminders. A
 * reminder is an outbound message the person cannot take back, so the screen is
 * applied when it is scheduled, and the schedule is rebuilt whenever the record
 * changes (see syncReminders): a meal that turns unsafe drops out of the list
 * and is reported as cancelled.
 */
import type { ScreenedMeal, Slot } from "./plan.ts";

export const SLOT_TIME: Record<Slot, { hour: number; minute: number }> = {
  breakfast: { hour: 7, minute: 30 },
  lunch: { hour: 12, minute: 30 },
  dinner: { hour: 18, minute: 30 },
};

/** A reminder this old is stale: better missed than sent as news hours late. */
export const GRACE_MS = 2 * 60 * 60 * 1000;

export type Reminder = {
  /** `<date>:<slot>` - one per meal slot. */
  id: string;
  date: string;
  slot: Slot;
  meal: string;
  /** UTC instant to send, epoch ms. */
  at: number;
  sentAt?: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * `tzOffsetMin` is what `Date#getTimezoneOffset()` returns in the browser:
 * minutes to ADD to local time to get UTC (Lagos, UTC+1, is -60).
 */
export function reminderInstant(date: string, slot: Slot, tzOffsetMin: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const { hour, minute } = SLOT_TIME[slot];
  return Date.UTC(y, m - 1, d, hour, minute) + tzOffsetMin * 60_000;
}

export function reminderText(r: Pick<Reminder, "slot" | "meal">): string {
  const { hour, minute } = SLOT_TIME[r.slot];
  return `${r.slot[0].toUpperCase()}${r.slot.slice(1)} at ${pad(hour)}:${pad(minute)} - ${r.meal}`;
}

export type Rebuilt = { reminders: Reminder[]; cancelled: Reminder[] };

export function buildReminders(
  meals: ScreenedMeal[],
  tzOffsetMin: number,
  previous: Reminder[],
  now = Date.now(),
): Rebuilt {
  const prior = new Map(previous.map((r) => [r.id, r]));
  const next: Reminder[] = [];

  for (const m of meals) {
    if (!m.safe) continue;
    const at = reminderInstant(m.date, m.slot, tzOffsetMin);
    if (at < now - GRACE_MS) continue;
    const id = `${m.date}:${m.slot}`;
    const before = prior.get(id);
    // A reminder already sent for the SAME meal is not sent again; a changed
    // meal is a new reminder.
    const sentAt = before && before.meal === m.meal ? before.sentAt : undefined;
    next.push({ id, date: m.date, slot: m.slot, meal: m.meal, at, ...(sentAt ? { sentAt } : {}) });
  }

  const keep = new Set(next.map((r) => `${r.id}|${r.meal}`));
  const cancelled = previous.filter((r) => !r.sentAt && r.at >= now - GRACE_MS && !keep.has(`${r.id}|${r.meal}`));
  return { reminders: next.sort((a, b) => a.at - b.at), cancelled };
}

export function dueReminders(reminders: Reminder[], now = Date.now()): Reminder[] {
  return reminders.filter((r) => !r.sentAt && r.at <= now && now - r.at <= GRACE_MS);
}
