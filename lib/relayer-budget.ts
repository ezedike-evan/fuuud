/**
 * CLIENT-SIDE RATE BUDGET for the relayer.
 *
 * The relayer meters each delegate key at 30 points per minute: remember costs
 * 5, analyze 10, recall 1 (measured in the Walrus Memory class demo, gotcha
 * #14). Past that it answers 401 AUTH_REJECTED for every call, reads included,
 * for minutes - indistinguishable from a bad key. withRelayerRetry already
 * backs off on that 401, but backing off after tripping the limit costs minutes;
 * spending the budget deliberately costs seconds.
 *
 * A sliding window rather than a refilling bucket, because the relayer counts
 * a window. Kept just under the real ceiling so clock skew between us and the
 * relayer cannot tip a full window over.
 */

export const POINTS = { recall: 1, remember: 5, analyze: 10 } as const;

const WINDOW_MS = 60_000;
const CEILING = 26; // the relayer's is 30; leave room for skew and other processes

type Spend = { at: number; points: number };

const windows = new Map<string, Spend[]>();

// unref'd: a waiter must never be the thing keeping a process alive.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms).unref());

function used(spends: Spend[], now: number) {
  while (spends.length && now - spends[0].at >= WINDOW_MS) spends.shift();
  return spends.reduce((sum, s) => sum + s.points, 0);
}

/** Thrown when waiting for the allowance would exceed `maxWaitMs`. */
export class RateLimited extends Error {
  readonly code = "RATE_LIMITED";
  // An explicit field, not a parameter property: this file is loaded by the stdio
  // server under node's strip-only TypeScript mode, which rejects parameter properties.
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Rate limited by the Walrus Memory relayer. Try again in about ${Math.ceil(retryAfterMs / 1000)} seconds.`);
    this.name = "RateLimited";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Wait until `points` fit inside the window for this key, then book them.
 * `bucket` is whatever the relayer meters on - the delegate key.
 *
 * `maxWaitMs` bounds the wait. The web app is happy to wait out a minute; a tool
 * call from an AI client is not - it has its own timeout and would show the
 * person an opaque failure. Past the bound this throws RateLimited instead.
 */
export async function acquire(bucket: string, points: number, opts: { maxWaitMs?: number } = {}): Promise<void> {
  const spends = windows.get(bucket) ?? [];
  windows.set(bucket, spends);
  const cost = Math.min(points, CEILING);
  const started = Date.now();

  for (;;) {
    const now = Date.now();
    if (used(spends, now) + cost <= CEILING) {
      spends.push({ at: now, points: cost });
      return;
    }
    const wait = Math.max(250, WINDOW_MS - (now - spends[0].at) + 50);
    if (opts.maxWaitMs !== undefined && now - started + wait > opts.maxWaitMs) throw new RateLimited(wait);
    await sleep(wait);
  }
}

/** Test seam. */
export function resetBudget() {
  windows.clear();
}
