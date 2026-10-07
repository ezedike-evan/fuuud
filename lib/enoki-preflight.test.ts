import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretEnokiResponse } from "./enoki-preflight.ts";

test("a successful nonce is ok", () => {
  assert.deepEqual(interpretEnokiResponse(200, '{"data":{"nonce":"x"}}', "mainnet"), { ok: true });
});

test("mainnet not enabled on the key is explained, naming the network and the fix", () => {
  const body = '{"errors":[{"code":"missing_networks","message":"The requested network is not enabled for this API key"}]}';
  const r = interpretEnokiResponse(403, body, "mainnet");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.problem, /mainnet/);
    assert.match(r.problem, /Enoki portal/);
    assert.match(r.problem, /NEXT_PUBLIC_ENOKI_API_KEY/);
  }
});

test("a bad key, other 403s, rate limits and odd statuses each get a distinct, actionable message", () => {
  const msg = (s: number, b = "") => { const r = interpretEnokiResponse(s, b, "testnet"); return r.ok ? "" : r.problem; };
  assert.match(msg(401), /invalid/);
  assert.match(msg(403, '{"errors":[{"code":"origin_not_allowed"}]}'), /origin_not_allowed/);
  assert.match(msg(429), /rate limiting/);
  assert.match(msg(500, "boom"), /500/);
});
