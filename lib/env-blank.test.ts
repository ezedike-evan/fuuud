import { test } from "node:test";
import assert from "node:assert/strict";
import { clampDistance } from "./facts.ts";

/**
 * Regression: `.env.example` ships KM_RELEVANCE_DISTANCE blank. Number("") is 0, so
 * a blank value made the relevance floor 0, which dropped EVERY recalled fact on a
 * live relayer: the agent answered as if the person had no allergies.
 */
test("a blank or whitespace value means unset, never zero", () => {
  assert.equal(clampDistance("", 0.6), 0.6);
  assert.equal(clampDistance("   ", 0.6), 0.6);
  assert.equal(clampDistance(undefined, 0.6), 0.6);
});

test("a real value is honoured, a nonsense one is ignored", () => {
  assert.equal(clampDistance("0.45", 0.6), 0.45);
  assert.equal(clampDistance("1.2", 0.6), 1.2);
  assert.equal(clampDistance("abc", 0.6), 0.6);
  assert.equal(clampDistance("3", 0.6), 0.6);
  assert.equal(clampDistance("-0.1", 0.6), 0.6);
});

test("zero is not a usable floor, so it is treated as unset too", () => {
  assert.equal(clampDistance("0", 0.6), 0.6);
});

test("the module-level floor is never zero when the env var is blank", async () => {
  process.env.KM_RELEVANCE_DISTANCE = "";
  const facts = await import(`./facts.ts?blank=${Math.random()}`);
  assert.equal(facts.RELEVANCE_DISTANCE, 0.6);
});
