import { streamText, StreamData } from "ai";
import { chatModel, describeModel } from "@/lib/model.ts";
import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { recallSafety, recallPreferences, recallFeedback, resolveConflicts, rememberFact, isOffTheRecord, claimsOfKind, unionFacts } from "@/lib/memory-contract.ts";
import { extractFacts } from "@/lib/extract.ts";
import { answersNoRestrictions, CLEARANCE_CLAIM } from "@/lib/clearance.ts";
import { buildPlanWeek } from "@/lib/plan-week.ts";
import { describeMemoryFailure } from "@/lib/memory-errors.ts";
import { buildSafetyConstraintsText } from "@/lib/safety.ts";

/*
 * 300s, not 60. A turn does a recall, a model call and a write, and the write
 * alone is allowed INDEX_TIMEOUT_MS (120s) because it embeds, encrypts,
 * uploads to Walrus and indexes. Against a 60s budget the platform killed the
 * whole invocation — FUNCTION_INVOCATION_TIMEOUT — which returns nothing at
 * all, not even the answer that had already been generated.
 */
export const maxDuration = 300;

/*
 * How long the FIRST TOKEN will wait for the write report.
 *
 * Reporting what was saved is worth a short pause; it is not worth a blank
 * screen. If the write has not finished by now the answer streams anyway and
 * the turn reports `pending` — the memory rail refreshes when the stream ends,
 * by which point the write has landed, so the truth arrives either way.
 */
const WRITE_REPORT_DEADLINE_MS = 10_000;

/*
 * Per fact, how long the turn waits for Walrus before handing the browser a job id.
 * The relayer keeps working after we stop listening; the browser polls
 * /api/memory/job and shows the real stages, like the Walrus Memory demo does.
 * Holding the whole chat stream open for a 30-120s upload is what turned a slow
 * write into a dropped connection, a "network error" and a lost draft.
 */
const WRITE_WAIT_MS = 6_000;

const BASE_PROMPT = [
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

async function postHandler(req: Request) {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });

  const { messages } = await req.json();
  const latest: string = messages.at(-1)?.content ?? "";
  /*
   * The agent's previous turn. Needed because it now ASKS about allergies
   * before suggesting anything, so the reply that matters most is usually a
   * bare "none that I know of" — meaningless to the extractor on its own.
   */
  const asked: string = [...messages]
    .slice(0, -1)
    .reverse()
    .find((m: { role: string }) => m.role === "assistant")?.content ?? "";

  /*
   * ONE recall pass per turn, in parallel. Never recall per-route.
   *
   * The health namespace is read with a STABLE query, never the person's turn.
   * Recall is a similarity search with a relevance floor, so querying with
   * "something light for dinner" pushed `allergy | groundnuts - hives` below
   * the floor and the agent answered as though no allergy existed — while the
   * memory rail, which has always used a fixed query, sat next to it showing
   * that same allergy. An allergy is not relevant only when it is mentioned.
   *
   * Feedback is read twice and merged: a stable query so standing dislikes
   * always apply, plus the person's own words so something they rejected last
   * time surfaces when it comes up again.
   *
   * This FAILS CLOSED. If the record is unreachable we do not quietly answer as
   * though the person had no conditions — a blind meal suggestion is exactly the
   * hazard this app exists to remove. Say so and stop.
   */
  let health, feedback;
  try {
    const [safety, standing, topical] = await Promise.all([
      recallSafety(address),
      recallPreferences(address),
      recallFeedback(address, latest),
    ]);
    health = safety;
    feedback = unionFacts(standing, topical);
  } catch (error) {
    if (error instanceof Error && error.name === "MemwalSetupRequired") {
      return new Response("Create your memory account first at /setup.", { status: 428 });
    }
    console.error("recall failed", error);
    const failure = describeMemoryFailure(error);
    // Fails CLOSED with the real reason. A refused key needs a different action from a slow relayer.
    return new Response(
      failure.kind === "key-refused"
        ? "I can't read your memory: Walrus Memory refused this app's key for your account, so I won't guess at your conditions. Set it up again at /setup, or reload in a minute if you changed nothing."
        : "I can't reach your memory right now, so I won't guess at your conditions. Try again in a moment.",
      { status: failure.kind === "key-refused" ? 409 : 503 },
    );
  }

  // Kicked off here so extraction overlaps everything below it.
  const writing = persist(address, latest, asked);

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

  const system = [
    BASE_PROMPT,
    memoryBlock,
    buildSafetyConstraintsText(profile),
  ].join("\n\n");

  // Resolve the model BEFORE starting the write path, so a missing provider key
  // is one readable sentence instead of an opaque 500. This is the first thing
  // anyone running the project from a fresh clone will hit.
  let model, described;
  try {
    model = await chatModel();
    described = await describeModel();
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "No model provider configured.",
      { status: 503 },
    );
  }

  /*
   * Ship the provenance with the answer. The UI renders one chip per fact the
   * reply was actually built from, so "it remembered" is something the person
   * can see and check rather than take on trust — and if the agent gets it
   * wrong, the chips show exactly which stored fact misled it.
   */
  /*
   * The write runs CONCURRENTLY with recall and model resolution, but its
   * result is reported in the FIRST annotation — the one sent before a single
   * token streams.
   *
   * It used to be appended in `onFinish`, immediately before `data.close()`,
   * and that report never reached the browser: a turn that saved two facts and
   * a turn that failed to save looked identical, because neither chip
   * rendered. The write path was the least reliable part of this app and the
   * only one with no diagnostic. The first annotation is a delivery path we
   * know works — it is how the recalled facts arrive.
   *
   * The cost is that the first token waits for extraction. Extraction is one
   * small call and it overlaps the recall above, so in practice it is close to
   * free; and being told what was saved is worth more than shaving that.
   */
  const stored = await Promise.race([
    writing,
    new Promise<StoredReport>((resolve) =>
      setTimeout(() => resolve({ written: [], skipped: [], failed: null, pending: true }), WRITE_REPORT_DEADLINE_MS),
    ),
  ]);

  const data = new StreamData();
  data.appendMessageAnnotation({
    recalled: [...activeHealth, ...activeFeedback].map((f) => ({
      text: f.text,
      distance: f.distance,
    })),
    provider: described.provider,
    model: described.chat,
    stored,
  });

  const result = streamText({
    model,
    system,
    messages,
    /*
     * THE WRITE MUST OUTLIVE THE ANSWER, AND THE FUNCTION MUST OUTLIVE BOTH.
     *
     * A serverless function is frozen the moment its response stream closes.
     * Closing here without awaiting the write kills it mid-flight: the answer
     * arrives, the fact is never stored, and the turn reports "still saving…"
     * forever because that chip was a snapshot taken at the report deadline and
     * nothing ever updates it.
     *
     * So the stream stays open until the write settles. It costs nothing the
     * reader can see — the answer has already streamed — and it is bounded by
     * maxDuration above. The client refreshes its memory rail when the stream
     * ends, which is now guaranteed to be after the fact has landed.
     */
    onFinish: async () => {
      try {
        // The first annotation was a snapshot taken at the report deadline. Send
        // the settled result too, so a late write ends as "saved N facts" (or a
        // real error) instead of staying "saving".
        data.appendMessageAnnotation({ stored: await writing });
      } catch (error) {
        // Already reported to the caller and logged inside persist(); swallow
        // it here so a failed write can never leave the stream hanging open.
        console.error("[fuuud] write did not settle before close:", error);
      }
      // A newly stored fact can make a scheduled meal unsafe. Re-reading the
      // plan re-screens it and cancels any reminder that no longer passes.
      try {
        const report = await writing;
        if (report.written.length) await buildPlanWeek(address);
      } catch {
        // Best effort: the next calendar load runs the same sweep.
      }
      data.close();
    },
  });
  return result.toDataStreamResponse({ data });
}

type StoredReport = {
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
async function persist(address: string, userTurn: string, asked: string): Promise<StoredReport> {
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

// Wrapped so the person's memory account is in scope (see inScope in lib/session.ts).
export const POST = (req: Request) => inScope(() => postHandler(req));
