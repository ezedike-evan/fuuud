import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyRefused, describeMemoryFailure } from "./memory-errors.ts";
import { RateLimited } from "./relayer-budget.ts";

test("a refused key is classified, offers setup, and says the empty view means UNREADABLE not EMPTY", () => {
  const f = describeMemoryFailure(new KeyRefused());
  assert.equal(f.kind, "key-refused");
  assert.equal(f.needsSetup, true);
  assert.match(f.message, /refused the key/);
  assert.match(f.message, /could not be read, not because it is empty/);
  assert.match(f.message, /Do not assume you have no allergies/);
});

test("the message is honest that the relayer answers the same way when rate limiting", () => {
  assert.match(describeMemoryFailure(new KeyRefused()).message, /rate limiting/);
});

test("a rate limit is not a refused key and does not push the person to set up again", () => {
  const f = describeMemoryFailure(new RateLimited(20_000));
  assert.equal(f.kind, "rate-limited");
  assert.equal(f.needsSetup, false);
});

test("timeouts, dropped connections and relayer 5xx are 'unreachable'", () => {
  for (const e of [Object.assign(new Error("x"), { name: "AbortError" }), new Error("fetch failed"), new Error("the operation timed out"), Object.assign(new Error("bad gateway"), { status: 502 })]) {
    assert.equal(describeMemoryFailure(e).kind, "unreachable", String(e));
  }
});

test("anything else keeps its reason but is still never presented as an empty record", () => {
  const f = describeMemoryFailure(new Error("Something brand new broke"));
  assert.equal(f.kind, "other");
  assert.match(f.message, /Something brand new broke/);
  assert.match(f.message, /not because it is empty/);
});

test("a non-error is handled, and long reasons are cut", () => {
  assert.equal(describeMemoryFailure(undefined).kind, "other");
  assert.ok(describeMemoryFailure(new Error("x".repeat(2000))).message.length < 600);
});

test("a KeyRefused is recognised even after crossing a serialisation boundary", () => {
  assert.equal(describeMemoryFailure({ name: "KeyRefused", code: "MEMORY_KEY_REFUSED", message: "m" }).kind, "key-refused");
});
