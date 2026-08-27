import { MemWal, MemWalMock } from "@mysten-incubation/memwal";

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRelayerRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isThrottle(error) || attempt >= AUTH_RETRY_DELAYS_MS.length) throw error;
      const wait = AUTH_RETRY_DELAYS_MS[attempt];
      console.warn(
        `[fuuud] ${label}: relayer returned 401 AUTH_REJECTED — ` +
          `retrying in ${wait / 1000}s (${attempt + 1}/${AUTH_RETRY_DELAYS_MS.length}). ` +
          `If every attempt fails, check the delegate key is registered on this account.`,
      );
      await sleep(wait);
    }
  }
}

const key = () => process.env.MEMWAL_PRIVATE_KEY?.trim();
const accountId = () => process.env.MEMWAL_ACCOUNT_ID?.trim();

export type MemWalMode = "live" | "mock";

export function memwalMode(): MemWalMode {
  return key() && accountId() ? "live" : "mock";
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
  if (memwalMode() === "mock") return mock();

  const existing = live.get(namespace);
  if (existing) return existing;

  const client = MemWal.create({
    key: key()!,
    accountId: accountId()!,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? "https://relayer-staging.memory.walrus.xyz",
    namespace,
  });
  live.set(namespace, client);
  return client;
}
