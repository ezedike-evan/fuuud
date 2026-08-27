/**
 * Namespaces are flat, opaque, exact-match strings. There is no hierarchy and
 * no normalization: "Kitchen:Health" and "kitchen:health" are two different
 * namespaces that can never see each other. Build them only through these
 * helpers so the convention holds everywhere.
 */
/*
 * THE PREFIX STAYS `kitchen:` EVEN THOUGH THE APP IS NOW CALLED FUUUD.
 *
 * This string is a storage key, not a name. Namespaces are exact-match with no
 * normalization, so every fact already written lives under
 * `kitchen:health:<address>` and nothing can reach it under any other prefix.
 * Renaming this to `fuuud:` would not migrate those memories — it would orphan
 * them, silently, leaving the record intact on Walrus and unreadable by the
 * app. There is no rename operation to undo it with.
 *
 * Change it only alongside a migration that re-writes every existing entry
 * under the new prefix, and only when losing the old ones is acceptable.
 */
function scope(kind: string, address: string) {
  const addr = address.trim().toLowerCase();
  if (!addr) throw new Error("address required to build a namespace");
  return `kitchen:${kind}:${addr}`;
}

/** Durable clinical facts: conditions, allergies. */
export const healthNs = (address: string) => scope("health", address);

/** Reactions and preferences: rejected meals, symptoms after eating. */
export const feedbackNs = (address: string) => scope("feedback", address);
