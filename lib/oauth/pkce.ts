import crypto from "node:crypto";

/**
 * PKCE (RFC 7636), S256 only. `plain` is refused outright: it protects nothing,
 * and Claude and ChatGPT both send S256.
 */

// RFC 7636 section 4.1: 43-128 characters from the unreserved set.
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
// base64url of a SHA-256 digest is always exactly 43 characters.
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export const isValidChallenge = (challenge: string) => CHALLENGE.test(challenge);

export function challengeFor(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/** Constant-time check that `verifier` hashes to the `challenge` recorded at authorize time. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier) || !CHALLENGE.test(challenge)) return false;
  const expected = Buffer.from(challengeFor(verifier));
  const given = Buffer.from(challenge);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
