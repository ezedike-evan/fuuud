import { test } from "node:test";
import assert from "node:assert/strict";
import { FRESH_WINDOW_MS, isFreshAccount } from "./fresh.ts";

const NOW = 1_800_000_000_000;

test("an account created moments ago is fresh", () => {
  assert.equal(isFreshAccount({ freshAt: NOW - 5_000 }, NOW), true);
});

test("it stops being fresh after the window, so the restore safety net returns", () => {
  assert.equal(isFreshAccount({ freshAt: NOW - FRESH_WINDOW_MS + 1 }, NOW), true);
  assert.equal(isFreshAccount({ freshAt: NOW - FRESH_WINDOW_MS }, NOW), false);
  assert.equal(isFreshAccount({ freshAt: NOW - 3 * FRESH_WINDOW_MS }, NOW), false);
});

test("an account the person already had is never fresh", () => {
  assert.equal(isFreshAccount({}, NOW), false);
  assert.equal(isFreshAccount({ freshAt: undefined }, NOW), false);
  assert.equal(isFreshAccount(null, NOW), false);
  assert.equal(isFreshAccount(undefined, NOW), false);
});

test("a timestamp from the future (clock skew or tampering) is not trusted", () => {
  assert.equal(isFreshAccount({ freshAt: NOW + 60_000 }, NOW), false);
});

test("non-numeric values are not trusted", () => {
  assert.equal(isFreshAccount({ freshAt: "now" as unknown as number }, NOW), false);
});
