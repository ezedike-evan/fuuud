import type { MemwalCreds } from "./memwal-scope.ts";

/**
 * A MemWal account this very setup just created has never held a memory, so there is
 * nothing on Walrus to rebuild an index from.
 *
 * Why it matters: an EMPTY recall normally triggers `restore()`, the safety net for
 * "the index lost its rows while the record is intact on Walrus", because for a
 * health record an empty answer is indistinguishable from "no allergies". That is
 * right for a returning person. For a brand-new account it just burns 10-18 seconds
 * per namespace, so the first page after setup hangs. This lets the memory layer
 * tell the two apart.
 *
 * Only `created: true` from /setup sets `freshAt`, never account reuse, and the
 * window is short so the net comes back as soon as a record could exist.
 */
export const FRESH_WINDOW_MS = 10 * 60_000;

export const isFreshAccount = (creds: Pick<MemwalCreds, "freshAt"> | null | undefined, now = Date.now()): boolean =>
  typeof creds?.freshAt === "number" && creds.freshAt <= now && now - creds.freshAt < FRESH_WINDOW_MS;
