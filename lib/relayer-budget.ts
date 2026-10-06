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

/**
 * Wait until `points` fit inside the window for this key, then book them.
 * `bucket` is whatever the relayer meters on - the delegate key.
 */
export async function acquire(bucket: string, points: number): Promise<void> {
  const spends = windows.get(bucket) ?? [];
  windows.set(bucket, spends);
  const cost = Math.min(points, CEILING);

  for (;;) {
    const now = Date.now();
    if (used(spends, now) + cost <= CEILING) {
      spends.push({ at: now, points: cost });
      return;
    }
    // Sleep until the oldest spend ages out, then look again.
    await sleep(Math.max(250, WINDOW_MS - (now - spends[0].at) + 50));
  }
}

/** Test seam. */
export function resetBudget() {
  windows.clear();
}
