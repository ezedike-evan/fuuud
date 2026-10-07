/**
 * Why reading or writing a person's memory failed, in words they can act on.
 *
 * The case that matters most: the relayer REFUSING the person's key (revoked, never
 * registered, wrong account). Before this, that triggered a two-and-a-half minute retry
 * ladder and then the page rendered an EMPTY record, which for a health app reads as
 * "no allergies". An unreadable record must never look like an empty one, so every
 * caller turns a failure into an explicit message instead of an empty list.
 *
 * No `server-only`, no imports from the app: it is loaded by the stdio server too, and
 * uses no TypeScript parameter properties (node's strip-only mode rejects them).
 */

/** The relayer answered 401 AUTH_REJECTED for this person's own key. */
export class KeyRefused extends Error {
  readonly code = "MEMORY_KEY_REFUSED";
  constructor() {
    super("Walrus Memory refused this account's key.");
    this.name = "KeyRefused";
  }
}

export type FailureKind = "key-refused" | "rate-limited" | "unreachable" | "other";
export type MemoryFailure = { kind: FailureKind; message: string; canRetry: boolean; needsSetup: boolean };

const NOT_EMPTY = " Nothing is shown because your record could not be read, not because it is empty. Do not assume you have no allergies.";

export function describeMemoryFailure(error: unknown): MemoryFailure {
  const e = error as { name?: string; code?: string; message?: string; status?: number } | null;
  const text = (e?.message ?? "").toLowerCase();

  if (e instanceof KeyRefused || e?.code === "MEMORY_KEY_REFUSED" || e?.name === "KeyRefused") {
    return {
      kind: "key-refused",
      canRetry: true,
      needsSetup: true,
      message:
        "Walrus Memory refused the key this app uses for your account. That happens when the key was removed (for example you revoked this app) " +
        "or was never registered. Set it up again to register a new key. The relayer answers the same way when it is rate limiting, " +
        "so if you have not changed anything, wait a minute and reload." + NOT_EMPTY,
    };
  }
  if (e?.code === "RATE_LIMITED" || e?.name === "RateLimited") {
    return { kind: "rate-limited", canRetry: true, needsSetup: false, message: "Walrus Memory is rate limiting this account. Wait a minute and reload." + NOT_EMPTY };
  }
  if (e?.name === "AbortError" || e?.name === "TimeoutError" || /timed? ?out|aborted|fetch failed|network|econnreset|socket|quorum/.test(text) || (typeof e?.status === "number" && e.status >= 500)) {
    return { kind: "unreachable", canRetry: true, needsSetup: false, message: "Walrus Memory could not be reached just now. Reload in a moment." + NOT_EMPTY };
  }
  return { kind: "other", canRetry: true, needsSetup: false, message: `Your memory could not be read (${(e?.message ?? "unknown error").slice(0, 160)}).` + NOT_EMPTY };
}
