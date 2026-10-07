import "server-only";
import {
  recallSafety, recallPreferences, recallPlan, resolveConflicts, claimsOfKind,
} from "./memory-contract.ts";
import { allergyStatusKnown, type HealthProfile } from "./safety.ts";
import { weekFrom, planFromFacts, screenPlan, type ScreenedMeal } from "./plan.ts";
import { syncReminders } from "./reminders-sync.ts";
import { describeMemoryFailure, type MemoryFailure } from "./memory-errors.ts";

export type PlanWeek = {
  dates: string[];
  meals: ScreenedMeal[];
  /** Reminders now queued for the person's connected channels. */
  remindersScheduled: number;
  /** Reminders pulled because their meal no longer passes the screen. */
  remindersCancelled: string[];
  /** True until they have told us their allergies — we refuse to plan blind. */
  blocked: boolean;
  /**
   * Set when the record could not be READ. Every other field is then empty, and that
   * emptiness means "unknown", never "no allergies": the UI must show this instead of the
   * plan, and nothing may be planned, exported or cancelled on the strength of it.
   */
  unavailable?: MemoryFailure;
  profile: { conditions: string[]; allergies: string[]; dislikes: string[]; likes: string[]; goals: string[]; observances: string[]; practical: string[] };
};


/** The record as it stands right now — the yardstick every meal is held to. */
export async function currentProfile(address: string): Promise<HealthProfile> {
  // NO .catch(() => []) here. A failed read swallowed into an empty profile made the planner
  // ask "do you have allergies?" of someone who had told it, and for the calendar an
  // unreadable record is indistinguishable from a clear one. Let it throw; callers say so.
  const [safety, prefs] = await Promise.all([recallSafety(address), recallPreferences(address)]);
  const health = resolveConflicts(safety).active;
  const feedback = resolveConflicts(prefs).active;
  return {
    conditions: claimsOfKind(health, "condition"),
    allergies: claimsOfKind(health, "allergy"),
    dislikes: claimsOfKind(feedback, "dislike"),
    likes: claimsOfKind(feedback, "preference"),
    goals: claimsOfKind(feedback, "goal"),
    observances: claimsOfKind(health, "observance"),
    household: claimsOfKind(feedback, "household"),
    practical: claimsOfKind(feedback, "practical"),
    cleared: claimsOfKind(health, "clearance").length > 0,
  };
}

/** A week that says "I could not read your record" instead of pretending the record is empty. */
export function unavailableWeek(error: unknown): PlanWeek {
  return {
    dates: weekFrom(),
    meals: [],
    remindersScheduled: 0,
    remindersCancelled: [],
    blocked: false,
    unavailable: describeMemoryFailure(error),
    profile: { conditions: [], allergies: [], dislikes: [], likes: [], goals: [], observances: [], practical: [] },
  };
}

export async function buildPlanWeek(address: string): Promise<PlanWeek> {
  let profile: HealthProfile;
  let planFacts: Awaited<ReturnType<typeof recallPlan>>;
  try {
    [profile, planFacts] = await Promise.all([currentProfile(address), recallPlan(address)]);
  } catch (error) {
    console.error("[fuuud] plan week: record unreadable:", error instanceof Error ? error.message : error);
    // Returned BEFORE the reminder sync below: syncing an empty plan would cancel every
    // queued reminder because the record happened to be unreadable.
    return unavailableWeek(error);
  }

  const dates = weekFrom();
  const stored = planFromFacts(resolveConflicts(planFacts).active);
  // Re-screened on every read, against today's record. A meal planned last week
  // is judged by what the agent knows now.
  const meals = screenPlan(stored.filter((m) => dates.includes(m.date)), profile);

  // Rebuild reminders from what was just screened. Never allowed to fail the page.
  const reminders = await syncReminders(address, meals).catch((error) => {
    console.error("[fuuud] reminder sync failed:", error);
    return { scheduled: 0, cancelled: [] };
  });

  return {
    dates,
    meals,
    remindersScheduled: reminders.scheduled,
    remindersCancelled: reminders.cancelled.map((r) => `${r.slot} on ${r.date}: ${r.meal}`),
    blocked: !allergyStatusKnown(profile),
    profile: {
      conditions: profile.conditions ?? [],
      allergies: profile.allergies ?? [],
      dislikes: profile.dislikes ?? [],
      likes: profile.likes ?? [],
      goals: profile.goals ?? [],
      observances: profile.observances ?? [],
      practical: profile.practical ?? [],
    },
  };
}

