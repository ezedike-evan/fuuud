import { test } from "node:test";
import assert from "node:assert/strict";
import { keysMatch, publicKeyFromSeed } from "./ed25519.ts";

// RFC 8032 section 7.1, test 1.
const SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const PUB = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

test("derives the RFC 8032 public key", () => {
  assert.equal(publicKeyFromSeed(SEED), PUB);
  assert.equal(keysMatch(SEED, PUB), true);
  assert.equal(keysMatch(SEED, PUB.toUpperCase()), true);
});

test("a different public key does not match the seed", () => {
  assert.equal(keysMatch(SEED, "00".repeat(32)), false);
});

test("malformed seeds are refused, not thrown on", () => {
  for (const bad of ["", "zz", "ab".repeat(31), "ab".repeat(33), "g".repeat(64)]) assert.equal(publicKeyFromSeed(bad), null, bad);
});
