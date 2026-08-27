/**
 * The stored-line format, and nothing else.
 *
 * Split out of ./facts because these are pure string accessors with no
 * dependencies, while ./facts imports `node:crypto` for idempotency keys.
 * Anything that only needs to READ a stored line — the meal calendar, and any
 * client component — can import this without dragging a Node builtin into the
 * browser bundle, which is a hard build error rather than dead weight.
 *
 * A stored line is `<date> | <kind> | <claim>`.
 */

export type RecalledFact = { text: string; distance: number; blobId: string };

/** Strip the `date | kind |` prefix so we compare claims, not timestamps. */
export function factBody(stored: string) {
  const parts = stored.split("|");
  const body = parts.length >= 3 ? parts.slice(2).join("|") : stored;
  return body.split(" - SUPERSEDES:")[0].trim().toLowerCase();
}

export function factKind(stored: string): string {
  return stored.split("|")[1]?.trim() ?? "";
}

export function factDate(stored: string) {
  return stored.split("|")[0]?.trim() ?? "";
}

export function sameFact(stored: string, incoming: string) {
  return factBody(stored) === incoming.trim().toLowerCase();
}
