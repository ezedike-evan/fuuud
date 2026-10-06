/**
 * iCalendar export of the screened plan. Floating local times (no zone, no Z):
 * "lunch at 12:30" means 12:30 wherever the person opens the file, which is the
 * intent, and it spares us guessing a timezone.
 *
 * Works in Apple, Outlook and Google Calendar with no OAuth and no key.
 */
import type { PlannedMeal } from "./plan.ts";
import { SLOT_TIME } from "./reminders.ts";

const pad = (n: number) => String(n).padStart(2, "0");

function stamp(date: string, hour: number, minute: number) {
  return `${date.replaceAll("-", "")}T${pad(hour)}${pad(minute)}00`;
}

export function mealWindow(meal: Pick<PlannedMeal, "date" | "slot">) {
  const { hour, minute } = SLOT_TIME[meal.slot];
  const endTotal = hour * 60 + minute + 45;
  return {
    start: stamp(meal.date, hour, minute),
    end: stamp(meal.date, Math.floor(endTotal / 60), endTotal % 60),
  };
}

const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545 content lines are folded at 75 octets, continuation lines start with a space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  let limit = 75;
  while (i < bytes.length) {
    let end = Math.min(i + limit, bytes.length);
    // Never cut inside a multi-byte character.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(i, end).toString("utf8"));
    i = end;
    limit = 74;
  }
  return parts.join("\r\n ");
}

export function buildIcs(meals: PlannedMeal[], now = new Date()): string {
  const dtstamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fuuud//Meal plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const m of meals) {
    const { start, end } = mealWindow(m);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${m.date}-${m.slot}@fuuud`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeText(`${m.slot[0].toUpperCase()}${m.slot.slice(1)}: ${m.meal}`)}`,
      "DESCRIPTION:Checked against your Fuuud record when exported. Not medical advice.",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** One-click "add to Google Calendar" link for a single meal. No OAuth. */
export function googleCalendarUrl(meal: PlannedMeal): string {
  const { start, end } = mealWindow(meal);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${meal.slot[0].toUpperCase()}${meal.slot.slice(1)}: ${meal.meal}`,
    dates: `${start}/${end}`,
    details: "Checked against your Fuuud record. Not medical advice.",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
