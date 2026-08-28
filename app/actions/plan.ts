"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateObject } from "ai";
import { chatModel } from "@/lib/model.ts";
import { getOwnerAddress } from "@/lib/session.ts";
import {
  recallSafety, recallPreferences, recallPlan, resolveConflicts,
  claimsOfKind, rememberFact, forgetFact,
} from "@/lib/memory-contract.ts";
import { buildSafetyConstraintsText, allergyStatusKnown, type HealthProfile } from "@/lib/safety.ts";
import {
  SLOTS, weekFrom, planFromFacts, screenPlan, formatPlanClaim,
  type PlannedMeal, type ScreenedMeal, type Slot,
} from "@/lib/plan.ts";

export type PlanWeek = {
  dates: string[];
  meals: ScreenedMeal[];
  /** True until they have told us their allergies — we refuse to plan blind. */
  blocked: boolean;
  profile: { conditions: string[]; allergies: string[]; dislikes: string[]; likes: string[]; goals: string[]; observances: string[]; practical: string[] };
};

async function requireOwner() {
  const address = await getOwnerAddress();
  if (!address) throw new Error("Sign in first.");
  return address;
}

/** The record as it stands right now — the yardstick every meal is held to. */
async function currentProfile(address: string): Promise<HealthProfile> {
  const [safety, prefs] = await Promise.all([
    recallSafety(address).catch(() => []),
    recallPreferences(address).catch(() => []),
  ]);
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

export async function getPlanWeek(): Promise<PlanWeek> {
  const address = await requireOwner();
  const [profile, planFacts] = await Promise.all([
    currentProfile(address),
    recallPlan(address).catch(() => []),
  ]);

  const dates = weekFrom();
  const stored = planFromFacts(resolveConflicts(planFacts).active);
  // Re-screened on every read, against today's record. A meal planned last week
  // is judged by what the agent knows now.
  const meals = screenPlan(stored.filter((m) => dates.includes(m.date)), profile);

  return {
    dates,
    meals,
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

const MealSchema = z.object({
  meals: z.array(
    z.object({
      date: z.string().describe("ISO date, YYYY-MM-DD, from the list given."),
      slot: z.enum(SLOTS),
      meal: z.string().describe("One Nigerian dish, plainly named. No commentary."),
    }),
  ),
});

/**
 * Propose a week, then SCREEN IT IN CODE before anything is stored.
 *
 * The model is given the same hard constraints the chat agent gets, but its
 * output is not taken on trust: every proposed dish goes through the
 * deterministic allergen and condition screen, and anything that trips it is
 * dropped rather than saved. A calendar that can quietly schedule the thing
 * someone is allergic to is worse than no calendar.
 */
export async function generatePlanWeek(justCleared = false): Promise<PlanWeek> {
  const address = await requireOwner();
  const profile = await currentProfile(address);

  /*
   * Refuse to plan for someone whose allergies nobody has asked about. Same
   * rule as the chat agent — a week of meals is seven times the exposure.
   *
   * `justCleared` covers the one case where the read cannot be trusted: the
   * person has just pressed "I have no allergies or conditions" and the write
   * is milliseconds old. Depending on recall to see it immediately would send
   * them back to the same blocked screen they just answered, which reads as
   * the button being broken.
   */
  if (!justCleared && !allergyStatusKnown(profile)) return getPlanWeek();
  const planningProfile = justCleared ? { ...profile, cleared: true } : profile;

  const dates = weekFrom();
  const { object } = await generateObject({
    model: await chatModel(),
    schema: MealSchema,
    system: [
      "You plan a week of meals for one person in Nigeria.",
      "Every meal is a dish people actually eat here - jollof, ofada, moi moi, egusi, akamu, plantain, garden egg, ewa agoyin, tuwo, pepper soup, efo riro.",
      "Name the dish and its main protein or side. No commentary, no nutrition notes, no brand names.",
      "Vary it across the week. Do not repeat the same dish twice in three days.",
      "",
      buildSafetyConstraintsText(planningProfile),
    ].join("\n"),
    prompt:
      `Plan breakfast, lunch and dinner for each of these dates: ${dates.join(", ")}. ` +
      `Return one entry per date and slot.`,
  });

  const proposed: PlannedMeal[] = object.meals
    .filter((m) => dates.includes(m.date) && SLOTS.includes(m.slot as Slot))
    .map((m) => ({ date: m.date, slot: m.slot as Slot, meal: m.meal.trim() }));

  // The gate. Unsafe proposals are discarded, never stored and never shown.
  const safe = screenPlan(proposed, planningProfile).filter((m) => m.safe);

  for (const meal of safe) {
    await rememberFact(address, "plan", formatPlanClaim(meal)).catch((error) => {
      console.error("[fuuud] could not store planned meal:", error);
    });
  }

  revalidatePath("/calendar");
  return getPlanWeek();
}

/**
 * "I have nothing to declare."
 *
 * The planner refuses to build a week before it knows about allergies, which
 * is right — but having no allergies is an ANSWER, not a missing answer, and
 * there was no way to give it from this page. That made the calendar look like
 * a feature reserved for people with a diagnosis, which is the opposite of the
 * intent: most people have nothing to declare and still want dinner sorted.
 *
 * This writes the clearance the same way a conversation would, so it lands in
 * the record, shows up in the ledger, and can be corrected later by simply
 * telling the agent about a condition — the newer fact wins on date.
 */
export async function declareNoRestrictions(): Promise<PlanWeek> {
  const address = await requireOwner();
  for (const claim of ["no known allergies", "no known medical conditions"]) {
    await rememberFact(address, "clearance", claim).catch((error) => {
      console.error("[fuuud] could not store clearance:", error);
    });
  }
  revalidatePath("/calendar");
  revalidatePath("/agent");
  // Plan straight away rather than waiting for the clearance to come back
  // through recall — the person has answered, and being asked again would look
  // like the button did nothing.
  return generatePlanWeek(true);
}

/** Drop one meal from the calendar. Retraction, not deletion — same as a fact. */
export async function removeMeal(date: string, slot: string): Promise<PlanWeek> {
  const address = await requireOwner();
  const stored = planFromFacts(resolveConflicts(await recallPlan(address).catch(() => [])).active);
  const target = stored.find((m) => m.date === date && m.slot === slot);
  if (target) await forgetFact(address, formatPlanClaim(target));
  revalidatePath("/calendar");
  return getPlanWeek();
}
