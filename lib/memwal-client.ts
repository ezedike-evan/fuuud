import { MemWal, MemWalMock } from "@mysten-incubation/memwal";
import { acquire, POINTS } from "./relayer-budget.ts";
import { currentScope, MemwalSetupRequired } from "./memwal-scope.ts";
import { KeyRefused } from "./memory-errors.ts";

/**
 * Plain factory with no `server-only` guard, so both the Next app and the MCP
 * server can build a client. Next code should import ./memwal instead, which
 * re-exports this behind the guard.
 *
 * ZERO-CREDENTIAL MODE. With no MEMWAL_* keys the app falls back to the SDK's
 * in-memory mock so someone can clone this repo and see the contract work —
 * the write gate, duplicate skipping, supersede stamping and the allergen
 * screen are all real in mock mode, because none of them need a network.
 *
 * What mock mode is NOT: the mock scores by token overlap, not embeddings, so
 * "what am I allergic to?" does not retrieve "groundnuts - hives" the way the
 * real relayer does. Semantic recall — the actual product claim — only exists
 * on live credentials. Never film a demo against the mock.
 */

/**
 * The relayer answers a throttled account with `401 AUTH_REJECTED` — the same
 * code it uses for a wrong or unregistered delegate key. The two are not
 * distinguishable from the response, so this retries a bounded number of times
 * before giving up.
 *
 * The distinction was established empirically: the same key writes
 * successfully, then after a handful of signed requests every call — writes AND
 * reads — returns 401 for a minute or two, then recovers on its own. The
 * SDK's error text sends you to check your dashboard credentials, which is a
 * dead end when the credentials are fine.
 *
 * If all attempts fail the original error is rethrown, so a genuinely bad key
 * still surfaces the message that tells you to go check it. The cost of being
 * wrong is three extra requests and about twenty seconds.
 */
/*
 * Measured on production: once the account trips this, the window is minutes,
 * not seconds — a 2/6/15s ladder exhausted itself and still came back 401.
 * These delays cover roughly two and a half minutes in total.
 */
const AUTH_RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 90_000];

function isThrottle(error: unknown) {
  const e = error as { status?: number; serverCode?: string };
  return e?.status === 401 && e?.serverCode === "AUTH_REJECTED";
}

/*
 * TRANSIENT FAILURES, which had no retry at all.
 *
 * The throttle ladder above only ever fired on 401. Everything else was
 * rethrown on the first attempt — including the SDK's own hardcoded 15s recall
 * abort, which is the failure this app hits most often. One slow moment on the
 * relayer and the turn came back "I can't reach your memory right now", even
 * though the very next attempt usually succeeds. We measured exactly that: a
 * recall failed, and the retry a second later returned the record.
 *
 * Safe to retry on both sides of the contract: a recall is a read, and a write
 * carries a deterministic idempotency key so a repeat collapses onto the
 * original job instead of storing the fact twice.
 *
 * NOT retried: 409 (an idempotency conflict is a real disagreement about
 * content) and every other 4xx (a bad request does not improve on repetition).
 */
const TRANSIENT_CODES = new Set([
  "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT",
]);

const TRANSIENT_TEXT = [
  "aborted", "fetch failed", "network", "socket hang up",
  "timeout", "timed out", "econnreset", "quorum",
];

export function isTransient(error: unknown): boolean {
  const e = error as { name?: string; status?: number; code?: string; message?: string };
  if (!e) return false;
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  if (typeof e.status === "number") {
    // 5xx is the server having a bad moment; 4xx is us being wrong.
    if (e.status >= 500) return true;
    return false;
  }
  if (e.code && TRANSIENT_CODES.has(e.code)) return true;
  const message = (e.message ?? "").toLowerCase();
  return TRANSIENT_TEXT.some((needle) => message.includes(needle));
}

/*
 * Short and fast, unlike the throttle ladder. The abort itself already cost
 * 15s, so a long backoff on top risks the request budget for no benefit — a
 * relayer that is merely busy answers on the next try.
 */
const TRANSIENT_RETRY_DELAYS_MS = [500, 2_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RelayerOp = keyof typeof POINTS;

/**
 * `op` books the call against the relayer's 30 points/minute allowance BEFORE
 * it is sent (see ./relayer-budget). Every attempt is booked, retries included,
 * because the relayer counts them. Defaults to a recall - the cheapest, and the
 * most common call.
 */
/**
 * A refused key is remembered briefly, per key. The relayer takes ~20 s to say no, so
 * without this every page load, and every tool call, would wait that long again.
 */
const REFUSED_TTL_MS = 60_000;
const refused = new Map<string, number>();
const recentlyRefused = (key: string) => (refused.get(key) ?? 0) > Date.now();
/** Test seam. */
export const forgetRefusals = () => refused.clear();

export async function withRelayerRetry<T>(label: string, fn: () => Promise<T>, op: RelayerOp = "recall"): Promise<T> {
  let throttleAttempt = 0;
  let transientAttempt = 0;
  // A PERSON's own key (a request with credentials in scope) fails fast. The 401 ladder below
  // exists for a single shared key hammered by scripts, where "throttled for minutes" was real;
  // for a person it only turns a revoked key into a two-and-a-half minute wait followed by an
  // empty-looking record. The client-side budget already keeps us under the relayer's allowance.
  const perPerson = Boolean(currentScope()?.creds);

  for (;;) {
    try {
      const bucket = delegateKey();
      if (perPerson && bucket && recentlyRefused(bucket)) throw new KeyRefused();
      if (bucket) await acquire(bucket, POINTS[op], { maxWaitMs: currentScope()?.maxWaitMs });
      return await fn();
    } catch (error) {
      if (perPerson && isThrottle(error)) {
        const bucket = delegateKey();
        if (bucket) refused.set(bucket, Date.now() + REFUSED_TTL_MS);
        throw new KeyRefused();
      }

      if (isThrottle(error) && throttleAttempt < AUTH_RETRY_DELAYS_MS.length) {
        const wait = AUTH_RETRY_DELAYS_MS[throttleAttempt++];
        console.warn(
          `[fuuud] ${label}: relayer returned 401 AUTH_REJECTED — ` +
            `retrying in ${wait / 1000}s (${throttleAttempt}/${AUTH_RETRY_DELAYS_MS.length}). ` +
            `If every attempt fails, check the delegate key is registered on this account.`,
        );
        await sleep(wait);
        continue;
      }

      if (isTransient(error) && transientAttempt < TRANSIENT_RETRY_DELAYS_MS.length) {
        const wait = TRANSIENT_RETRY_DELAYS_MS[transientAttempt++];
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(
          `[fuuud] ${label}: ${detail} — retrying in ${wait}ms ` +
            `(${transientAttempt}/${TRANSIENT_RETRY_DELAYS_MS.length}).`,
        );
        await sleep(wait);
        continue;
      }

      throw error;
    }
  }
}

const envKey = () => process.env.MEMWAL_PRIVATE_KEY?.trim();
const envAccountId = () => process.env.MEMWAL_ACCOUNT_ID?.trim();

/**
 * Whether a request without its own credentials may fall back to the
 * environment's single shared account. OFF by default: that is the model where
 * one server-held key reads everyone's record, which is the opposite of the
 * product claim. Scripts, the MCP server and tests have no request scope and
 * always use the environment.
 */
const sharedAllowed = () => process.env.MEMWAL_SHARED_ACCOUNT === "1";

type Resolved = { key: string; accountId: string } | "mock";

function resolve(): Resolved {
  const scope = currentScope();
  if (scope) {
    if (scope.creds) return { key: scope.creds.delegateKey, accountId: scope.creds.accountId };
    if (sharedAllowed() && envKey() && envAccountId()) return { key: envKey()!, accountId: envAccountId()! };
    // Local development with DEV_FAKE_ADDRESS has no wallet to create an account
    // with, so it works on the offline mock. Refused in production by
    // getOwnerAddress, so this can never serve a real person.
    if (process.env.DEV_FAKE_ADDRESS && process.env.NODE_ENV !== "production") return "mock";
    // Signed in, no account. Never fall through to the mock here: it would
    // accept the person's allergy and forget it when the process restarts.
    throw new MemwalSetupRequired();
  }
  return envKey() && envAccountId() ? { key: envKey()!, accountId: envAccountId()! } : "mock";
}

/** The key the relayer meters this request against, if any. */
const delegateKey = () => {
  try {
    const r = resolve();
    return r === "mock" ? undefined : r.key;
  } catch {
    return undefined;
  }
};

/** The MemWal account this request speaks for, or "mock". Used to key per-account caches. */
export function currentAccountKey(): string {
  try {
    const r = resolve();
    return r === "mock" ? "mock" : r.accountId;
  } catch {
    return "none";
  }
}

export type MemWalMode = "live" | "mock";

export function memwalMode(): MemWalMode {
  return resolve() === "mock" ? "mock" : "live";
}

/**
 * ONE mock for the whole process, shared across namespaces.
 *
 * The mock keeps its records in instance memory, so a fresh instance per call
 * would silently forget every write. It takes a namespace per operation, and
 * namespace isolation still holds inside a single instance.
 *
 * This also means mock memory dies with the process — it is a way to exercise
 * the contract offline, not a store.
 */
let sharedMock: MemWalMock | null = null;
let warned = false;

function mock() {
  if (!sharedMock) {
    sharedMock = MemWalMock.create({ namespace: "default" });
  }
  if (!warned) {
    warned = true;
    console.warn(
      "[fuuud] MEMWAL_PRIVATE_KEY / MEMWAL_ACCOUNT_ID not set — " +
        "running on the in-memory mock. Facts do not persist and recall is " +
        "token-overlap, not semantic. See .env.example.",
    );
  }
  return sharedMock;
}

/**
 * ONE live client per namespace, for the same reason there is one mock.
 *
 * `MemWal.create()` is not a cheap handle. Each instance builds and caches its
 * own ephemeral SEAL SessionKey (5-minute TTL, signed client-side and sent as
 * `x-seal-session`), plus its own single-flight guards and per-request nonces.
 * Constructing one per call threw all of that away every time and made the
 * relayer issue a fresh session for each operation.
 *
 * That churn is what produced intermittent `401 AUTH_REJECTED` on writes while
 * reads kept working: a turn does two recalls and a write, and a smoke run does
 * ten operations, each one a brand-new session. The failures got more likely
 * the further into a run you were. Reads survived because they are one request;
 * writes poll a job across several.
 *
 * The offline mock was cached from the start, so this asymmetry was invisible
 * until the first run against a real relayer.
 */
const live = new Map<string, MemWal>();

export function createMemWal(namespace: string) {
  const who = resolve();
  if (who === "mock") return mock();

  // Cached per ACCOUNT as well as namespace: two people's clients must never
  // share a SEAL session, and the namespace alone no longer identifies a person
  // once the delegate key is theirs.
  const id = `${who.accountId}:${namespace}`;
  const existing = live.get(id);
  if (existing) return existing;

  const client = MemWal.create({
    key: who.key,
    accountId: who.accountId,
    serverUrl: process.env.MEMWAL_SERVER_URL?.trim() || "https://relayer-staging.memory.walrus.xyz",
    namespace,
  });
  live.set(id, client);
  return client;
}
