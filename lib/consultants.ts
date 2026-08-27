import { normalizeConditions, CONDITION_LABELS } from "./safety.ts";

/**
 * Static seed. There is no database in this app on purpose: memory is the only
 * store, which is what lets a stranger clone the repo and run it with three env
 * vars. The memory feature here is the RANKING, not the list.
 */
export type Consultant = {
  slug: string;
  name: string;
  role: string;
  /** Canonical condition keys this practitioner is the right first call for. */
  treats: string[];
};

export const CONSULTANTS: Consultant[] = [
  {
    slug: "dr-amaka",
    name: "Dr. Amaka Obi",
    role: "General practitioner",
    treats: ["hypertension", "ulcer", "gerd", "kidney_disease", "gout"],
  },
  {
    slug: "dietitian-ifeanyi",
    name: "Ifeanyi Nwosu",
    role: "Clinical dietitian",
    treats: ["diabetes", "high_cholesterol", "anemia", "gout"],
  },
  {
    slug: "nurse-ada",
    name: "Nurse Ada Eze",
    role: "Prenatal & maternal health",
    treats: ["pregnancy", "anemia"],
  },
];

export type RankedConsultant = Consultant & { score: number; reason: string };

/**
 * Rank practitioners by the conditions recalled from the user's memory.
 * The `reason` string is rendered next to each result — the visible proof that
 * memory is driving the app, not just the chat.
 */
export function rankConsultants(recalledConditions: string[]): RankedConsultant[] {
  const keys = normalizeConditions(recalledConditions);

  return CONSULTANTS.map((c) => {
    const matched = c.treats.filter((t) => keys.includes(t));
    const labels = matched.map((m) => CONDITION_LABELS[m] ?? m);
    return {
      ...c,
      score: matched.length,
      reason: labels.length
        ? `Ranked for your ${labels.join(" and ")}.`
        : "No stored condition matches this practitioner yet.",
    };
  }).sort((a, b) => b.score - a.score);
}
