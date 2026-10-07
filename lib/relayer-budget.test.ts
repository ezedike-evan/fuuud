import { test } from "node:test";
import assert from "node:assert/strict";
import { acquire, resetBudget, POINTS } from "./relayer-budget.ts";

test("spends under the ceiling return immediately", async () => {
  resetBudget();
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) await acquire("k", POINTS.remember); // 25 points
  assert.ok(Date.now() - t0 < 200);
});

test("the sixth write waits for the window instead of tripping the relayer", async () => {
  resetBudget();
  for (let i = 0; i < 5; i++) await acquire("k", POINTS.remember);
  const pending = acquire("k", POINTS.remember);
  const raced = await Promise.race([pending.then(() => "done"), new Promise((r) => setTimeout(() => r("waiting"), 300))]);
  assert.equal(raced, "waiting");
});

test("keys are metered independently", async () => {
  resetBudget();
  for (let i = 0; i < 5; i++) await acquire("a", POINTS.remember);
  const t0 = Date.now();
  await acquire("b", POINTS.remember);
  assert.ok(Date.now() - t0 < 200);
});

test("a bounded wait throws RateLimited instead of hanging a tool call", async () => {
  const { RateLimited } = await import("./relayer-budget.ts");
  resetBudget();
  for (let i = 0; i < 5; i++) await acquire("bounded", POINTS.remember);
  await assert.rejects(() => acquire("bounded", POINTS.remember, { maxWaitMs: 500 }), (e: unknown) => e instanceof RateLimited && (e as { retryAfterMs: number }).retryAfterMs > 0);
});
