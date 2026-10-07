import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "./friendly-errors.ts";

const ID = "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f";

test("the exact error from setup becomes an explanation of the likely cause", () => {
  const msg = friendlyError(new Error(`Object ${ID} not found`), "Setup failed", "testnet");
  assert.match(msg, /0x8bf82c…199f/);
  assert.match(msg, /on testnet/);
  assert.match(msg, /MEMWAL_REGISTRY_ID/);
  assert.match(msg, /NEXT_PUBLIC_SUI_NETWORK/);
  assert.ok(!msg.includes(ID), "the full id is noise to a person");
});

test("Enoki refusals name the network instead of pointing at the redirect URI", () => {
  const msg = friendlyError(new Error("Request to Enoki API failed (status: 403)"), "x", "mainnet");
  assert.match(msg, /403/);
  assert.match(msg, /mainnet enabled/);
  assert.ok(!/redirect/i.test(msg));
});

test("common wallet and browser failures get a plain instruction", () => {
  assert.match(friendlyError(new Error("Failed to open popup"), "x"), /Allow pop-ups/);
  assert.match(friendlyError(new Error("Popup closed"), "x"), /closed/);
  assert.match(friendlyError(new Error("No valid gas coins found for the transaction."), "x"), /sponsor/);
  assert.match(friendlyError(new Error("User rejected the request"), "x"), /nothing was changed/);
  assert.match(friendlyError(new TypeError("Failed to fetch"), "x"), /Could not reach/);
});

test("an unrecognised error is passed through, never hidden", () => {
  assert.equal(friendlyError(new Error("Something brand new broke"), "fallback"), "Something brand new broke");
});

test("non-errors use the fallback", () => {
  assert.equal(friendlyError(undefined, "fallback"), "fallback");
  assert.equal(friendlyError(null, "fallback"), "fallback");
  assert.equal(friendlyError(new Error(""), "fallback"), "fallback");
});

test("hitting the 20-key cap says what it is and where to fix it", () => {
  for (const raw of ["MoveAbort(MoveLocation { module: account }, 2)", "ETooManyDelegateKeys", "Too many delegate keys"]) {
    const msg = friendlyError(new Error(raw), "x");
    assert.match(msg, /maximum of 20 keys/);
    assert.match(msg, /Settings/);
  }
});
