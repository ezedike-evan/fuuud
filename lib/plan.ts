/**
 * Pure meal-plan algebra — no I/O, no `server-only`, no SDK. Same split as
 * ./facts: the rules that decide what a plan means are testable without a
 * network.
 *
 * A planned meal is stored as a normal fact whose CLAIM carries the date it is
 * for, because the fact's own date prefix records when it was written:
 *
 *   2026-08-28 | plan | 2026-08-30 | lunch | jollof rice with grilled chicken
 *   └ written                      └ eaten  └ slot  └ meal
 */
// ./fact-line, not ./facts: this module is imported by a client component,
// and ./facts pulls in node:crypto.
import { factBody, factKind, type RecalledFact } from "./fact-line.ts";
import { screenReply, type HealthProfile } from "./safety.ts";

export const SLOTS = ["breakfast", "lunch", "dinner"] as const;
export type Slot = (typeof SLOTS)[number];

export type PlannedMeal = {
  /** ISO date the meal is FOR. */
  date: string;
  slot: Slot;
  meal: string;
};

/** A planned meal plus whatever the current record says about it. */
export type ScreenedMeal = PlannedMeal & {
  safe: boolean;
  /** Ingredients that now clash — empty when safe. */
  flags: string[];
};

export function formatPlanClaim(meal: PlannedMeal): string {
  return `${meal.date} | ${meal.slot} | ${meal.meal.trim()}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse one stored line back into a meal, or null if it is not a plan. */
export function parsePlan(stored: string): PlannedMeal | null {
  if (factKind(stored) !== "plan") return null;
  // factBody strips the `written | kind |` prefix and keeps inner pipes.
  const [date, slot, ...rest] = factBody(stored).split("|").map((p) => p.trim());
  if (!date || !ISO_DATE.test(date)) return null;
  if (!SLOTS.includes(slot as Slot)) return null;
  const meal = rest.join("|").trim();
  if (!meal) return null;
  return { date, slot: slot as Slot, meal };
}

/**
 * THE POINT OF THE WHOLE FEATURE.
 *
 * A meal is screened against the record as it stands NOW, not as it stood when
 * the meal was planned. Tell the agent about a groundnut allergy today and
 * every groundnut meal already sitting in next week's calendar turns red — the
 * memory reaches backwards into work that was already done, which is something
 * a chat transcript can never do for you.
 */
export function screenPlan(meals: PlannedMeal[], profile: HealthProfile): ScreenedMeal[] {
  return meals.map((meal) => {
    const { safe, allergenFlags, conditionFlags } = screenReply(meal.meal, profile);
    return { ...meal, safe, flags: [...allergenFlags, ...conditionFlags] };
  });
}

/** Stored lines → meals, newest write per (date, slot) winning. */
export function planFromFacts(facts: RecalledFact[]): PlannedMeal[] {
  const bySlot = new Map<string, PlannedMeal>();
  for (const fact of facts) {
    const meal = parsePlan(fact.text);
    if (meal) bySlot.set(`${meal.date}:${meal.slot}`, meal);
  }
  return [...bySlot.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot),
  );
}

/**
 * The seven dates starting from `from` (defaults to today), ISO.
 *
 * These are the person's LOCAL dates, not UTC ones — someone in Lagos opening
 * this at half past midnight should see today, not yesterday. Noon is set
 * before stepping so neither a DST shift nor the UTC conversion can roll the
 * calendar date underneath us.
 */
export function weekFrom(from = new Date()): string[] {
  const start = new Date(from);
  start.setHours(12, 0, 0, 0); // midday, so a DST shift cannot roll the date
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function dayLabel(iso: string): { weekday: string; day: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
    day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
  };
}
