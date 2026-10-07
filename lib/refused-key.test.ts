import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { forgetRefusals, withRelayerRetry } from "./memwal-client.ts";
import { runInScope } from "./memwal-scope.ts";
import { KeyRefused } from "./memory-errors.ts";
import { resetBudget } from "./relayer-budget.ts";

const refusal = () => Object.assign(new Error("401 from relayer"), { status: 401, serverCode: "AUTH_REJECTED" });
const creds = (key: string) => ({ accountId: "0x" + "a".repeat(64), delegateKey: key, delegatePublicKey: "b".repeat(64), owner: "0xowner" });

beforeEach(() => {
  forgetRefusals();
  resetBudget();
});

test("a person's refused key fails FAST: one attempt, no multi-minute retry ladder", async () => {
  let calls = 0;
  const t0 = Date.now();
  await assert.rejects(
    () => runInScope({ creds: creds("k1") }, () => withRelayerRetry("recall", async () => { calls++; throw refusal(); })),
    (e: unknown) => e instanceof KeyRefused,
  );
  assert.equal(calls, 1);
  assert.ok(Date.now() - t0 < 1000, "must not wait on a retry ladder");
});

test("the refusal is remembered: the next read for the same key fails instantly without calling the relayer", async () => {
  await assert.rejects(() => runInScope({ creds: creds("k2") }, () => withRelayerRetry("a", async () => { throw refusal(); })), KeyRefused);
  let called = false;
  const t0 = Date.now();
  await assert.rejects(() => runInScope({ creds: creds("k2") }, () => withRelayerRetry("b", async () => { called = true; return 1; })), KeyRefused);
  assert.equal(called, false, "no second 20-second wait for the relayer to say no again");
  assert.ok(Date.now() - t0 < 200);
});

test("a DIFFERENT key is unaffected by another key's refusal", async () => {
  await assert.rejects(() => runInScope({ creds: creds("k3") }, () => withRelayerRetry("a", async () => { throw refusal(); })), KeyRefused);
  const ok = await runInScope({ creds: creds("k4-new-key") }, () => withRelayerRetry("b", async () => "fine"));
  assert.equal(ok, "fine", "registering a new key must recover immediately");
});

test("other failures still behave as before: a transient error is retried once and succeeds", async () => {
  let calls = 0;
  const out = await runInScope({ creds: creds("k5") }, () =>
    withRelayerRetry("t", async () => { if (++calls === 1) throw new Error("fetch failed"); return "ok"; }),
  );
  assert.equal(out, "ok");
  assert.equal(calls, 2);
});

test("a non-401 error passes through untouched and does not mark the key refused", async () => {
  await assert.rejects(() => runInScope({ creds: creds("k6") }, () => withRelayerRetry("x", async () => { throw Object.assign(new Error("bad request"), { status: 400 }); })), /bad request/);
  assert.equal(await runInScope({ creds: creds("k6") }, () => withRelayerRetry("y", async () => "still usable")), "still usable");
});

test("the shared env key (scripts, stdio) keeps its long throttle ladder: it is NOT treated as a refused person", async () => {
  // No scope, so no per-person credentials. The first retry waits 5 s, which is the ladder, not a fast failure.
  let calls = 0;
  const t0 = Date.now();
  const out = await withRelayerRetry("env", async () => { if (++calls === 1) throw refusal(); return "recovered"; });
  assert.equal(out, "recovered");
  assert.equal(calls, 2);
  assert.ok(Date.now() - t0 >= 4500, "a throttled shared key must still wait and retry");
});
