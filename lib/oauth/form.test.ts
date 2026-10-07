import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScopes, readForm } from "./form.ts";

const post = (body: string, type = "application/x-www-form-urlencoded") =>
  new Request("https://x.test/oauth/token", { method: "POST", headers: { "content-type": type }, body });

test("reads a normal form body, with a charset parameter", async () => {
  const r = await readForm(post("a=1&b=two", "application/x-www-form-urlencoded; charset=UTF-8"));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.params.get("b"), "two");
});

test("JSON and other content types are refused (a token endpoint is form-encoded)", async () => {
  assert.equal((await readForm(post("{}", "application/json"))).ok, false);
  assert.equal((await readForm(post("a=1", "text/plain"))).ok, false);
});

test("a repeated parameter is refused rather than letting one silently win", async () => {
  const r = await readForm(post("code=a&code=b"));
  assert.equal(r.ok, false);
});

test("an oversized body is refused", async () => {
  assert.equal((await readForm(post("a=" + "x".repeat(9000)))).ok, false);
});

test("scopes: space-delimited, deduplicated, unknown ones are an error", () => {
  assert.deepEqual(parseScopes(null), { ok: true, scopes: [] });
  assert.deepEqual(parseScopes("memory:read  memory:read offline_access"), { ok: true, scopes: ["memory:read", "offline_access"] });
  assert.deepEqual(parseScopes("memory:read admin"), { ok: false });
});
