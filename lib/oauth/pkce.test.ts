import { test } from "node:test";
import assert from "node:assert/strict";
import { challengeFor, isValidChallenge, verifyPkce } from "./pkce.ts";

// RFC 7636 appendix B.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

test("matches the RFC 7636 test vector", () => {
  assert.equal(challengeFor(VERIFIER), CHALLENGE);
  assert.equal(verifyPkce(VERIFIER, CHALLENGE), true);
});

test("a wrong verifier fails", () => {
  assert.equal(verifyPkce(VERIFIER.replace("d", "e"), CHALLENGE), false);
});

test("plain mode is refused: the challenge must be a 43-char S256 digest, not the verifier itself", () => {
  assert.equal(isValidChallenge(VERIFIER), true); // same length, so only the HASH check can reject plain
  assert.equal(verifyPkce(VERIFIER, VERIFIER), false);
});

test("malformed verifiers and challenges are rejected before any comparison", () => {
  assert.equal(verifyPkce("short", CHALLENGE), false);
  assert.equal(verifyPkce("x".repeat(129), CHALLENGE), false);
  assert.equal(verifyPkce("has spaces " + "x".repeat(40), CHALLENGE), false);
  assert.equal(verifyPkce(VERIFIER, "short"), false);
  assert.equal(verifyPkce(VERIFIER, CHALLENGE + "="), false);
});
