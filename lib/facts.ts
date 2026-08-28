/**
 * Pure fact algebra — no I/O, no `server-only`, no SDK. Everything here is
 * unit-testable without a network or a relayer, which is why the reconciliation
 * rules live in this file rather than next to the client.
 */

import { createHash } from "node:crypto";
import { factBody, factKind, factDate, sameFact, type RecalledFact } from "./fact-line.ts";

// Re-exported so every existing import of these from ./facts keeps working.
export { factBody, factKind, factDate, sameFact };
export type { RecalledFact };

export type FactKind =
  | "condition"
  | "allergy"
  | "rejection"
  | "symptom"
  /**
   * A standing food preference — "I don't like a lot of veg", "I can't stand
   * okra". Not clinical and never a safety constraint, but durable: without it
   * the agent re-suggests the same rejected food every session and the person
   * has to keep saying no. A dislike shapes suggestions; it never overrides an
   * allergy or a condition.
   */
  | "dislike"
  /**
   * A standing food they LIKE — "I like vegetables", "I love pepper soup".
   *
   * The mirror of `dislike`, and its absence was a real hole: the gate could
   * record what to avoid but not what someone actually enjoys, so a meal plan
   * built from memory could only ever be inoffensive. Steering toward food
   * someone likes is most of what makes a plan worth following.
   */
  | "preference"
  /**
   * A dietary aim they are working toward — "cutting back on sugar", "trying
   * to eat more protein", "eating less red meat".
   *
   * Not a condition (no diagnosis), not a dislike (they may like the thing
   * they are cutting), and not a craving (it is durable and about them). It
   * shapes every suggestion until they say otherwise.
   */
  | "goal"
  /**
   * A religious or fasting rule — "I don't eat pork", "halal only",
   * "vegetarian", "I fast during Ramadan".
   *
   * NOT a dislike. A dislike is taste and the agent is told to work around it
   * where it can; an observance is a rule the person does not intend to break,
   * and serving it is a real failure rather than an unappealing suggestion.
   * Kept with the clinical facts because it is retrieved and enforced the same
   * way, not because it is medical.
   */
  | "observance"
  /**
   * Who they cook and eat for — "I cook for four", "my wife is vegetarian",
   * "just me". Changes portions, and can introduce a second person's
   * constraints into every meal.
   */
  | "household"
  /**
   * What they can actually manage — budget, time, equipment, skill. "Tight
   * budget this month", "no oven", "twenty minutes on weeknights".
   *
   * The most common reason good advice goes unfollowed is that it assumed a
   * kitchen and an afternoon the person does not have.
   */
  | "practical"
  /**
   * An explicit NEGATIVE assertion — "I have no allergies", "no conditions".
   *
   * Storing the absence matters as much as storing the presence. Without it,
   * "nothing recalled" is ambiguous between "they told us they are clear" and
   * "we have never asked", and the agent cannot tell whether it is safe to
   * suggest a meal or obliged to ask first. This is what stops it asking the
   * same question every single session.
   */
  | "clearance"
  /**
   * A meal scheduled for a date. Stored as
   * `<written> | plan | <date> | <slot> | <meal>` so the day it is FOR is part
   * of the claim, not the day it was written. Lives in its own namespace.
   */
  | "plan";

/**
 * Not a kind you can ask for. A tombstone is written by `forgetFact` to retract
 * an earlier claim, because the SDK has no delete — see RETRACTION below.
 */
export const TOMBSTONE = "tombstone";

/** Below this, two facts are talking about the same thing. */
export const DUPLICATE_DISTANCE = 0.3;

/**
 * At or above this distance a recalled memory is noise and must not enter the
 * prompt. The SDK drops anything with `distance >= maxDistance` server-side;
 * we re-filter with `<` on the way back because mock mode does not.
 *
 * 0.6, not the 0.5 we started with. MemWal's own guidance is `maxDistance <
 * 0.7`, and for a health agent the two failure modes are not symmetric: a
 * filler line that slips through is cleaned up downstream by resolveConflicts
 * and claimsOfKind, whereas an allergy that was phrased differently from the
 * question and fell below the floor is simply gone. Tunable at demo time
 * because embedding distances are not portable across relayer versions.
 */
export const RELEVANCE_DISTANCE = clampDistance(
  process.env.KM_RELEVANCE_DISTANCE,
  0.6,
);

function clampDistance(raw: string | undefined, fallback: number) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 2 ? n : fallback;
}

/** Phrases meaning "do not persist anything from this turn". */
const OFF_THE_RECORD = [
  "don't save", "dont save", "do not save",
  "off the record",
  "don't remember", "dont remember", "do not remember",
  "forget i said",
];

export function isOffTheRecord(userText: string) {
  const haystack = userText.toLowerCase();
  return OFF_THE_RECORD.some((phrase) => haystack.includes(phrase));
}

const today = () => new Date().toISOString().slice(0, 10);

/** `2026-08-27 | allergy | groundnuts - hives` */
export function formatFact(kind: FactKind, text: string, supersedes?: string) {
  const base = `${today()} | ${kind} | ${text.trim()}`;
  return supersedes ? `${base} - SUPERSEDES: ${supersedes}` : base;
}

/**
 * The query to use when looking for an existing copy of a claim.
 *
 * Search with the shape you store, or you are not comparing like with like.
 * Recall is an embedding distance over the WHOLE string, and everything in the
 * namespace carries a `date | kind |` prefix — so querying with the bare claim
 * `groundnuts - hives` against the stored `2026-08-27 | allergy | groundnuts -
 * hives` lands well outside DUPLICATE_DISTANCE and the duplicate is missed.
 *
 * The offline mock hides this completely: it scores by token overlap, where the
 * prefix is three cheap tokens and the two strings look nearly identical. It
 * took a run against the real relayer to see it.
 *
 * The date in the probe will rarely match the date on the stored line. That is
 * fine — one differing token out of the whole string moves the distance far
 * less than dropping the prefix entirely does.
 */
export function factProbe(kind: FactKind, text: string) {
  return `${today()} | ${kind} | ${text.trim()}`;
}

/**
 * RETRACTION. `2026-08-27 | tombstone | RETRACTS: groundnuts - hives`
 *
 * There is no delete in the SDK — `remember()` appends and nothing removes.
 * So "forget that" is written down rather than pretended: a tombstone is a
 * record that outranks the claim it names, and resolveConflicts drops that
 * claim from everything the agent can read.
 *
 * What this does NOT do is erase. The original blob stays on Walrus, encrypted
 * under the owner's keys, until its storage period expires. Every piece of copy
 * that mentions forgetting has to say that.
 */
export function formatTombstone(factText: string) {
  return `${today()} | ${TOMBSTONE} | ${factBody(factText)} - RETRACTED`;
}

/**
 * The claim a tombstone names, or "" if this line is not a tombstone.
 *
 * Accepts both shapes. The original was `RETRACTS: <claim>`, which put the
 * boilerplate first and made the whole line embed closer to the word "retracts"
 * than to the claim — a tombstone for `groundnuts - hives` came back at
 * distance 0.805 for "what am I allergic to?" while the allergy itself came
 * back at 0.519. With a 0.6 floor the retraction was filtered out as noise and
 * the retracted allergy stayed live. Leading with the claim fixes that.
 * Tombstones written in the old shape are still honoured.
 */
export function retractionTarget(stored: string) {
  if (factKind(stored) !== TOMBSTONE) return "";
  return factBody(stored)
    .replace(/^retracts:\s*/, "")
    .replace(/\s*-\s*retracted$/, "")
    .trim();
}

/**
 * A write key that is stable across retries of the SAME claim and different
 * for a different one.
 *
 * `remember()` is append-only, and the SDK keeps a pending key alive when a
 * transport times out after the server already accepted the job. Without this,
 * a timeout on a slow connection — a conference room, which is where this gets
 * demoed — writes the person's allergy to their medical record twice and pays
 * for both. The date is in the key so a genuine re-assertion tomorrow still
 * lands as its own entry.
 */
/**
 * THE KEY IS DERIVED FROM THE EXACT LINE BEING WRITTEN.
 *
 * It used to be built from (namespace, kind, claim, today) while the content
 * sent was `formatFact(kind, claim, supersedes)` — which carries a
 * `- SUPERSEDES: ...` clause the key knew nothing about. Write the same claim
 * twice in one day, once plain and once superseding, and the relayer sees one
 * key with two different bodies:
 *
 *   409 idempotency_key was already used for a request with different content
 *
 * Two paths reach that. A contradiction now WRITES with a supersede stamp
 * rather than being skipped; and when the dedupe probe times out we write
 * without a stamp, so a later attempt whose probe succeeds produces the same
 * claim WITH one.
 *
 * Hashing the stored line keeps the original guarantee — a retry of an
 * identical write collapses onto the same job instead of billing twice — while
 * letting genuinely different content take its own key. The date and the kind
 * are still in the key, because they are in the line.
 */
export function idempotencyKeyFor(namespace: string, storedLine: string) {
  return createHash("sha256")
    .update(`${namespace} ${storedLine.trim().toLowerCase()}`)
    .digest("hex");
}

/** Pull the raw claims of one kind out of a set of stored lines. */
export function claimsOfKind(facts: { text: string }[], kind: FactKind): string[] {
  return facts.filter((f) => factKind(f.text) === kind).map((f) => factBody(f.text)).filter(Boolean);
}

/**
 * When two recalled facts disagree, the newer date wins. The loser is returned
 * too, so the UI can show it rather than silently dropping it — this is a
 * medical record, and quietly dropping half of a contradiction is how an agent
 * ends up confidently acting on the wrong one.
 *
 * A tombstone (see formatTombstone) outranks every claim it names, regardless
 * of distance. Retracted facts come back in their own bucket for the same
 * reason: the person can see what they retracted and when.
 */
export function resolveConflicts(facts: RecalledFact[]) {
  /** newest tombstone date per retracted claim */
  const retractions = new Map<string, string>();
  for (const fact of facts) {
    const target = retractionTarget(fact.text);
    if (!target) continue;
    const date = factDate(fact.text);
    if (date >= (retractions.get(target) ?? "")) retractions.set(target, date);
  }

  const byBody = new Map<string, RecalledFact[]>();
  for (const fact of facts) {
    if (factKind(fact.text) === TOMBSTONE) continue; // never readable as a claim
    const key = factBody(fact.text);
    byBody.set(key, [...(byBody.get(key) ?? []), fact]);
  }

  const active: RecalledFact[] = [];
  const superseded: RecalledFact[] = [];
  const retracted: RecalledFact[] = [];
  for (const [body, group] of byBody) {
    /*
     * Newest date wins. On a SAME-DAY tie, the fact that stamped SUPERSEDES
     * wins — it was written knowing about the other one and said so, which is
     * the only ordering signal available inside a single day. Reversing a
     * preference in the same conversation ("I like veg" … "actually I don't")
     * is common enough that leaving this to insertion order is a coin toss.
     */
    const sorted = [...group].sort((a, b) => {
      const byDate = factDate(b.text).localeCompare(factDate(a.text));
      if (byDate !== 0) return byDate;
      return Number(b.text.includes(" - SUPERSEDES:")) - Number(a.text.includes(" - SUPERSEDES:"));
    });
    // A same-day retraction wins: you only retract a claim that already exists.
    const killed = retractions.get(body);
    if (killed !== undefined && killed >= factDate(sorted[0].text)) {
      retracted.push(...sorted);
      continue;
    }
    active.push(sorted[0]);
    superseded.push(...sorted.slice(1));
  }
  return { active, superseded, retracted };
}


/**
 * Merge recall results, keeping one entry per stored line at its best (lowest)
 * distance.
 *
 * Needed because a turn reads a namespace with more than one query: a stable
 * safety query that must always return conditions and allergies, and the
 * person's own words for whatever is topical. The two overlap, and the same
 * fact arriving twice would be listed to the model twice.
 */
export function unionFacts(...groups: RecalledFact[][]): RecalledFact[] {
  const best = new Map<string, RecalledFact>();
  for (const fact of groups.flat()) {
    const seen = best.get(fact.text);
    if (!seen || fact.distance < seen.distance) best.set(fact.text, fact);
  }
  return [...best.values()].sort((a, b) => a.distance - b.distance);
}
