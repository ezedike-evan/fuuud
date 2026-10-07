import { rememberFact, isOffTheRecord, recallSafety, recallPreferences, recallFeedback, resolveConflicts, claimsOfKind, unionFacts, type RecalledFact } from "@/lib/memory-contract.ts";
import { extractFacts } from "@/lib/extract.ts";
import { answersNoRestrictions, CLEARANCE_CLAIM } from "@/lib/clearance.ts";
import { buildSafetyConstraintsText } from "@/lib/safety.ts";

/**
 * What a chat turn is made of, shared by the website (app/api/chat) and Telegram
 * (lib/telegram-chat) so the two can never drift apart: the same prompt, the same
 * recall, the same fail-closed rule, the same write gate.
 */

export const BASE_PROMPT = [
  "You are Fuuud, a cautious food and nutrition assistant for users in Nigeria.",
  "Suggest meals people actually eat here - jollof, ofada, moi moi, egusi, akamu, plantain, garden egg - never generic Western meal plans.",
  // The failure this exists to stop: a full day's menu produced for someone
  // whose allergies were never asked about. Suggesting food is the whole point
  // of the app, so the rule has to be explicit or the model does it anyway.
  "CHECK WHAT YOU ALREADY KNOW BEFORE YOU ASK. The block below is their own stored record, carried across every session. If it names an allergy or condition, you have already been told - use it and do not ask again. Asking someone to repeat an allergy they gave you is the one thing this app exists to prevent.",
  "ASK ONLY WHEN THE RECORD IS EMPTY. If it holds nothing about allergies or conditions, your first reply is a question, not a meal. One short question covering both, and say they only have to tell you once.",
  "When you use a stored fact, say so in passing - 'no groundnut, as you told me' - so they can see the memory working and correct it if it is wrong.",
  "Do not pad that question with a sample menu, an example day, or 'in the meantime you could try'. A suggestion attached to the question defeats it.",
  "Once you know - including when they tell you they have none - suggest food normally and do not ask again.",
  "Respect what they dislike. Do not serve a disliked food, and do not blend, puree or hide it in a dish and present that as a solution. Suggest something else.",
  "A religious or fasting rule is not a preference. Never serve anything that breaks one, and never offer a 'just this once' version.",
  "Stay inside what they can actually manage - their budget, their time, their kitchen. A meal someone cannot afford or cannot cook is a dead end, not advice.",
  "Build on what they like and what they are working toward. A plan made only of things to avoid is one nobody follows - lead with food they enjoy that still fits their constraints.",
  "You do not diagnose and you are not a doctor. Whenever a condition is involved, say the guidance is not medical advice and suggest seeing a practitioner.",
  "If the user says a stored fact is wrong or asks you to forget it, tell them to retract it on the settings page - deciding privately to stop mentioning it changes nothing, because the record outlives this conversation.",
  "Keep every reply under 110 words.",
].join(" ");

/** One recall pass: standing safety facts, standing preferences, and what this turn mentions. THROWS when memory is unreadable - callers fail closed. */
export async function recallAll(address: string, latest: string): Promise<{ health: RecalledFact[]; feedback: RecalledFact[] }> {
  const [safety, standing, topical] = await Promise.all([
    recallSafety(address),
    recallPreferences(address),
    recallFeedback(address, latest),
  ]);
  return { health: safety, feedback: unionFacts(standing, topical) };
}

/** The system prompt for a turn, plus the resolved facts it was built from. */
export function composeSystem(health: RecalledFact[], feedback: RecalledFact[]) {
  const activeHealth = resolveConflicts(health).active;
  const activeFeedback = resolveConflicts(feedback).active;
  const profile = {
    conditions: claimsOfKind(activeHealth, "condition"),
    allergies: claimsOfKind(activeHealth, "allergy"),
    dislikes: claimsOfKind(activeFeedback, "dislike"),
    likes: claimsOfKind(activeFeedback, "preference"),
    goals: claimsOfKind(activeFeedback, "goal"),
    observances: claimsOfKind(activeHealth, "observance"),
    household: claimsOfKind(activeFeedback, "household"),
    practical: claimsOfKind(activeFeedback, "practical"),
    // An explicit "I have no allergies" is a fact we stored. Without reading it
    // back, the agent cannot distinguish "they told us they are clear" from
    // "we never asked", and would interrogate them again every session.
    cleared: claimsOfKind(activeHealth, "clearance").length > 0,
  };

  const memoryBlock = [...activeHealth, ...activeFeedback].length
    ? `WHAT YOU ALREADY KNOW ABOUT THIS USER (from their own stored memory, carried across sessions):\n${
        [...activeHealth, ...activeFeedback].map((f) => `- ${f.text}`).join("\n")
      }\nThese were retrieved for THIS turn regardless of what was asked. Use them without asking the user to repeat them. If two facts disagree, trust the newer date and say so out loud.`
    : "You have no stored facts about this user yet. This is a genuinely empty record, not a failed lookup - the conditions and allergies are fetched every turn with a fixed query, so an empty list means they have never told you.";

  return { system: [BASE_PROMPT, memoryBlock, buildSafetyConstraintsText(profile)].join("\n\n"), activeHealth, activeFeedback };
}

/*
 * Per fact, how long the turn waits for Walrus before handing the browser a job id.
 * The relayer keeps working after we stop listening; the browser polls
 * /api/memory/job and shows the real stages, like the Walrus Memory demo does.
 * Holding the whole chat stream open for a 30-120s upload is what turned a slow
 * write into a dropped connection, a "network error" and a lost draft.
 */
export const WRITE_WAIT_MS = 6_000;

export type StoredReport = {
  /** The write outran the report deadline; the rail refresh will show it. */
  pending?: boolean;
  written: string[];
  /** Already in the record. Not a failure — the record was already right. */
  skipped: string[];
  failed: string | null;
  /** Accepted by the relayer, not finished: the browser follows these. */
  jobs?: { jobId: string; kind: string }[];
};

/**
 * Returns what happened rather than swallowing it. A write that fails silently
 * in a health record is worse than one that fails loudly: the person carries on
 * believing the agent knows about their allergy.
 */
export async function persist(address: string, userTurn: string, asked: string): Promise<StoredReport> {
  const written: string[] = [];
  const skipped: string[] = [];
  const jobs: { jobId: string; kind: string }[] = [];
  try {
    if (!userTurn.trim() || isOffTheRecord(userTurn)) return { written, skipped, failed: null };
    const facts = await extractFacts(userTurn, asked);

    /*
     * THE FLOOR UNDER THE MOST IMPORTANT TURN.
     *
     * The agent asks about allergies and promises they only have to answer
     * once. If the answer is a plain "none" and the model fails to classify it
     * — which is exactly what happened in a live run — that promise is broken
     * silently and they get asked again next session.
     *
     * So when the question and the answer are both unambiguous, the clearance
     * is written whatever the model returned. The model still handles every
     * nuanced case; this only guarantees the simple one.
     */
    if (answersNoRestrictions(asked, userTurn) && !facts.some((f) => f.kind === "clearance")) {
      facts.push({ kind: "clearance", text: CLEARANCE_CLAIM });
    }

    for (const fact of facts) {
      const outcome = await rememberFact(address, fact.kind, fact.text, { userTurn, waitMs: WRITE_WAIT_MS });
      if (outcome.status === "written") {
        written.push(`${fact.kind}: ${fact.text}`);
        if (outcome.pending) jobs.push({ jobId: outcome.pending.jobId, kind: fact.kind });
      }
      // A duplicate means the record was ALREADY right. Reporting that as
      // nothing-happened is what makes "it didn't remember" impossible to tell
      // apart from "it already knew".
      else if (outcome.reason === "duplicate") skipped.push(`${fact.kind}: ${fact.text}`);
    }
    return { written, skipped, failed: null, ...(jobs.length ? { jobs } : {}) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[fuuud] memory write failed:", detail);
    return { written, skipped, failed: detail, ...(jobs.length ? { jobs } : {}) };
  }
}
