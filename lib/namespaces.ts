/**
 * Namespaces are flat, opaque, exact-match strings. There is no hierarchy and
 * no normalization: "Kitchen:Health" and "kitchen:health" are two different
 * namespaces that can never see each other. Build them only through these
 * helpers so the convention holds everywhere.
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
