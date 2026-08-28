import { createMemWal as getMemWal, memwalMode, withRelayerRetry } from "./memwal-client.ts";
import { healthNs, feedbackNs, planNs } from "./namespaces.ts";
import {
  DUPLICATE_DISTANCE,
  RELEVANCE_DISTANCE,
  TOMBSTONE,
  factBody,
  factKind,
  factProbe,
  formatFact,
  formatTombstone,
  idempotencyKeyFor,
  isOffTheRecord,
  sameFact,
  type FactKind,
  type RecalledFact,
} from "./facts.ts";

/**
 * THE MEMORY CONTRACT — the I/O half. The pure rules live in ./facts.
 *
 * Two SDK behaviours drive this whole design:
 *
 *  1. `remember()` is APPEND-ONLY. It is not an upsert. Writing the same fact
 *     twice produces two entries and both surface on recall. Recall ranks by
 *     vector distance, not recency — so a stale "allergic to groundnuts" can
 *     outrank a newer "groundnut allergy resolved". Every write reconciles.
 *
 *  2. `recall()` has NO default relevance threshold. In a small namespace it
 *     returns the nearest entries even when unrelated. For a health agent,
 *     filler means reasoning over the wrong condition — so maxDistance is
 *     mandatory on every read.
 *
 *  3. There is NO delete, and no `list()`. Forgetting is a tombstone write
 *     (see ./facts) and listing is a pair of deliberately broad recalls.
 */

/**
 * How long to wait for a write to finish indexing.
 *
 * 120s, matching the SDK's own bulk-polling default — not the 30s we started
 * with, which the production relayer routinely overran under load. A write is
 * heavy: embed, SEAL-encrypt, upload to Walrus, transfer onchain, index.
 *
 * A timeout here does NOT mean the write failed. The relayer keeps processing
 * as a background job, which is why every write carries a deterministic
 * idempotency key — a retry collapses onto the original job instead of writing
 * the person's condition to their record twice.
 */
const INDEX_TIMEOUT_MS = 120_000;

/**
 * Ceiling on the memory text handed to the model per namespace. Recall trims
 * to fit, keeping the closest hits (`high-relevance-only`). The record only
 * grows, and an unbounded memory block eventually crowds out the conversation
 * it is supposed to inform.
 */
const RECALL_TOKEN_BUDGET = 700;

/** How many missing blobs one warm-up pass will pull back from Walrus. */
const RESTORE_LIMIT = 25;

const KIND_NAMESPACE: Record<FactKind, (a: string) => string> = {
  condition: healthNs,
  allergy: healthNs,
  // A clearance is a clinical statement about the person's body ("no known
  // allergies"), so it belongs with the conditions it negates — not in the
  // preferences namespace where a recall for allergies would never see it.
  clearance: healthNs,
  // An observance is a hard constraint, so it lives with the facts that are
  // retrieved by the safety query on every single turn.
  observance: healthNs,
  rejection: feedbackNs,
  symptom: feedbackNs,
  dislike: feedbackNs,
  preference: feedbackNs,
  goal: feedbackNs,
  household: feedbackNs,
  practical: feedbackNs,
  plan: planNs,
};

export type { FactKind, RecalledFact };
export {
  resolveConflicts, isOffTheRecord, claimsOfKind,
  factBody, factDate, factKind, retractionTarget, RELEVANCE_DISTANCE, unionFacts,
} from "./facts.ts";

/** Read durable clinical facts. Call ONCE per turn, never per route. */
export const recallHealth = (address: string, query: string) => recallFrom(healthNs(address), query);

/** Read reactions and preferences. */
export const recallFeedback = (address: string, query: string) => recallFrom(feedbackNs(address), query);

/*
 * STABLE QUERIES.
 *
 * Recall is a similarity search with a relevance floor, so WHAT YOU ASK FOR
 * decides what the model gets to see. Asking with the person's own turn means
 * "something light for dinner" is the query against their medical record —
 * and `allergy | groundnuts - hives` sits nowhere near that in embedding
 * space, so it falls below the floor and the agent answers as though the
 * allergy did not exist.
 *
 * An allergy is not relevant only when the person happens to mention it. These
 * queries are fixed so the safety-critical facts come back on EVERY turn,
 * whatever was asked.
 */
export const SAFETY_QUERY =
  "medical conditions, allergies, intolerances, religious or fasting rules, and foods to avoid";
export const PREFERENCE_QUERY =
  "foods liked and disliked, dietary goals, budget, cooking time and equipment, " +
  "who they cook for, meals rejected and symptoms after eating";

/** Conditions, allergies and clearances — retrieved regardless of the question. */
export const recallSafety = (address: string) => recallFrom(healthNs(address), SAFETY_QUERY);

/** Standing preferences — likewise always relevant to a meal suggestion. */
export const recallPreferences = (address: string) => recallFrom(feedbackNs(address), PREFERENCE_QUERY);

/** Scheduled meals. A stable query: a plan is never "relevant" by similarity. */
export const recallPlan = (address: string) =>
  recallFrom(planNs(address), "meals scheduled for breakfast, lunch and dinner");

/**
 * The relevance floor is an EMBEDDING distance, so it only means anything
 * against the real relayer. The offline mock scores by token overlap and
 * returns a flat 1.0 for anything that does not share a word with the query,
 * which would filter out every fact the moment you phrase a question naturally.
 * In mock mode we therefore take what the namespace has and let the caller's
 * conflict resolution do the rest.
 */
function relevanceFloor() {
  return memwalMode() === "mock" ? Number.POSITIVE_INFINITY : RELEVANCE_DISTANCE;
}

/**
 * INDEX WARMING. The relayer's vector index and the blobs on Walrus are two
 * different things, and only the second is durable. A namespace whose index
 * rows are missing recalls NOTHING while the record sits intact on Walrus —
 * and for this app an empty recall is indistinguishable from a healthy person
 * with no conditions. That is the one failure this whole project exists to
 * prevent, so it does not get to fail silently.
 *
 * `restore()` re-downloads the owner's blobs for a namespace, decrypts them,
 * re-embeds and reinserts the index rows. It costs seconds per blob, so it runs
 * ONLY on an empty recall, ONCE per namespace per process, and never in front
 * of a recall that already returned something.
 */
const warmed = new Map<string, Promise<void>>();

function warmOnce(namespace: string, memwal: ReturnType<typeof getMemWal>) {
  const existing = warmed.get(namespace);
  if (existing) return existing;

  const run = withRelayerRetry(`restore ${namespace}`, () => memwal.restore(namespace, RESTORE_LIMIT))
    .then((r) => {
      console.warn(
        `[fuuud] warmed ${namespace}: restored=${r.restored} ` +
          `skipped=${r.skipped} total=${r.total}`,
      );
    })
    .catch((error) => {
      // A failed warm-up must not fail the turn — the caller still gets the
      // empty result it already had, and fails closed on its own terms.
      console.error(`[fuuud] restore failed for ${namespace}`, error);
    });

  warmed.set(namespace, run);
  return run;
}

async function recallFrom(namespace: string, query: string): Promise<RecalledFact[]> {
  const memwal = getMemWal(namespace);
  const floor = relevanceFloor();

  // The relayer rejects a blank query. `list_memory` and an empty opening turn
  // both reach here, so coerce rather than 400.
  const q = query.trim() || " ";

  const read = async () => {
    const result = await withRelayerRetry(`recall ${namespace}`, () => memwal.recall({
      query: q,
      namespace,
      limit: 10,
      maxTokens: RECALL_TOKEN_BUDGET,
      truncationStrategy: "high-relevance-only",
      ...(Number.isFinite(floor) ? { maxDistance: floor } : {}),
    }));
    return result.results
      .filter((r) => r.distance < floor)
      .map((r) => ({ text: r.text, distance: r.distance, blobId: r.blob_id }));
  };

  /**
   * Tombstones are swept separately, with NO relevance floor.
   *
   * A retraction must never be missed because of a distance threshold. The
   * claim and the tombstone that kills it do not sit at the same distance from
   * a given question — measured live, an allergy came back at 0.519 for "what
   * am I allergic to?" while its tombstone sat at 0.805. Filtering both through
   * one floor meant the fact survived and the retraction did not, so a
   * retracted allergy reached the model depending on the phrasing of the
   * question. That is the exact failure this app exists to prevent.
   *
   * Tombstones are few and short, so sweeping them unconditionally is cheap.
   * resolveConflicts drops them from anything the model can read.
   */
  const sweepTombstones = async () => {
    const result = await withRelayerRetry(`tombstones ${namespace}`, () =>
      memwal.recall({ query: q, namespace, limit: 25 }),
    );
    return result.results
      .filter((r) => factKind(r.text) === TOMBSTONE)
      .map((r) => ({ text: r.text, distance: r.distance, blobId: r.blob_id }));
  };

  const [hits, tombstones] = await Promise.all([read(), sweepTombstones()]);
  if (hits.length) return [...hits, ...tombstones];

  await warmOnce(namespace, memwal);
  return [...(await read()), ...tombstones];
}

export type WriteOutcome =
  | { status: "skipped"; reason: "off-the-record" | "duplicate"; existing?: string }
  | { status: "written"; namespace: string; text: string; supersedes?: string };

/**
 * The only write path.
 *   - identical fact already stored -> skip, write nothing
 *   - near-duplicate that disagrees -> store the new fact, naming what it replaces
 *   - nothing similar               -> store it plain
 */
export async function rememberFact(
  address: string,
  kind: FactKind,
  text: string,
  opts: { userTurn?: string } = {},
): Promise<WriteOutcome> {
  if (opts.userTurn && isOffTheRecord(opts.userTurn)) {
    return { status: "skipped", reason: "off-the-record" };
  }

  const namespace = KIND_NAMESPACE[kind](address);
  const memwal = getMemWal(namespace);

  /*
   * Probe with the STORED shape, not the bare claim — see factProbe.
   *
   * THE PROBE MUST NEVER SINK THE WRITE. The SDK aborts a recall after a
   * hardcoded 15s (memwal.js: `setTimeout(() => ac.abort(), 15000)`), and
   * withRelayerRetry only retries 401 throttles — so a slow relayer threw an
   * AbortError out of here, the caller caught it, and the person's allergy was
   * dropped on the floor. Deduplication is an optimisation; recording the fact
   * is the product.
   *
   * Writing without the probe risks a second copy of a claim already stored.
   * That is the cheap failure: same-day repeats collapse onto one job via the
   * idempotency key, and resolveConflicts keeps only the newest entry per claim
   * body, so a duplicate is invisible downstream. A lost allergy is not
   * recoverable by anything.
   */
  let closest: { text: string; distance: number } | undefined;
  try {
    const nearby = await withRelayerRetry(`dedupe ${namespace}`, () => memwal.recall({
      query: factProbe(kind, text),
      namespace,
      limit: 5,
      maxDistance: DUPLICATE_DISTANCE,
    }));
    closest = nearby.results
      .filter((r) => r.distance < DUPLICATE_DISTANCE)
      .sort((a, b) => a.distance - b.distance)[0];
  } catch (error) {
    console.warn(
      `[fuuud] dedupe probe failed for ${namespace} ` +
        `(${error instanceof Error ? error.message : String(error)}) — ` +
        "writing the fact anyway rather than losing it.",
    );
  }

  /*
   * Same claim AND same kind is a duplicate. Same claim with a DIFFERENT kind
   * is a contradiction — "I like vegetables" then "I don't like vegetables" —
   * and falls through to the supersede path below, where the newer fact is
   * stored naming the one it replaces.
   */
  if (closest && sameFact(closest.text, text, kind)) {
    return { status: "skipped", reason: "duplicate", existing: closest.text };
  }

  const supersedes = closest?.text;
  const stored = formatFact(kind, text, supersedes);

  // *AndWait, not remember(): plain remember() returns before indexing
  // finishes, and the very next recall would miss the fact we just wrote.
  //
  // The idempotency key makes the duplicate check above hold even when the
  // network lies to us — a timeout after the server accepted the job collapses
  // onto that job instead of writing the claim a second time.
  await withRelayerRetry(`write ${namespace}`, () =>
    memwal.rememberAndWait(stored, namespace, {
      timeoutMs: INDEX_TIMEOUT_MS,
      idempotencyKey: idempotencyKeyFor(namespace, kind, text),
    }),
  );

  return { status: "written", namespace, text: stored, supersedes };
}

export type ForgetOutcome =
  | { status: "not-found" }
  | { status: "retracted"; namespace: string; tombstone: string; target: string };

/**
 * RETRACT a fact. There is no delete in the SDK, so this writes a tombstone
 * that outranks the claim it names; resolveConflicts then keeps that claim out
 * of everything the agent reads.
 *
 * It is not erasure and must never be described as erasure. The original blob
 * stays on Walrus, encrypted under the owner's keys, until its storage period
 * expires.
 *
 * The kind is unknown at this point — the person says "forget the groundnut
 * thing", not "forget the allergy in kitchen:health". So both namespaces are
 * searched and the tombstone lands wherever the claim actually lives.
 */
export async function forgetFact(address: string, text: string): Promise<ForgetOutcome> {
  const namespaces = [healthNs(address), feedbackNs(address)];

  /*
   * Unlike a write, there is no stored shape to probe with here: the person
   * says "forget the groundnut thing", not "forget 2026-08-27 | allergy | …".
   * So this casts a wider net at the relevance floor and then decides on the
   * TEXT rather than the distance — an exact claim match always wins, and a
   * near miss only counts if it is genuinely close.
   *
   * Retraction has to be precise. Retracting the wrong fact off a fuzzy vector
   * match would quietly remove a condition the person still has.
   */
  const wanted = text.trim().toLowerCase();

  const candidates = await Promise.all(
    namespaces.map(async (namespace) => {
      const found = await withRelayerRetry(`forget-search ${namespace}`, () =>
        getMemWal(namespace).recall({
          query: text,
          namespace,
          limit: 10,
          maxDistance: RELEVANCE_DISTANCE,
        }),
      );

      const usable = found.results
        .filter((r) => factKind(r.text) !== TOMBSTONE)
        .map((r) => ({ ...r, exact: factBody(r.text) === wanted }))
        .filter((r) => r.exact || r.distance < DUPLICATE_DISTANCE)
        .sort((a, b) => Number(b.exact) - Number(a.exact) || a.distance - b.distance);

      return usable[0] ? { namespace, nearest: usable[0] } : null;
    }),
  );

  const hit = candidates
    .filter((c) => c !== null)
    .sort(
      (a, b) =>
        Number(b.nearest.exact) - Number(a.nearest.exact) ||
        a.nearest.distance - b.nearest.distance,
    )[0];

  if (!hit) return { status: "not-found" };

  const tombstone = formatTombstone(hit.nearest.text);
  await withRelayerRetry(`retract ${hit.namespace}`, () =>
    getMemWal(hit.namespace).rememberAndWait(tombstone, hit.namespace, {
      timeoutMs: INDEX_TIMEOUT_MS,
      idempotencyKey: idempotencyKeyFor(hit.namespace, "tombstone", factBody(hit.nearest.text)),
    }),
  );

  return {
    status: "retracted",
    namespace: hit.namespace,
    tombstone,
    target: hit.nearest.text,
  };
}
