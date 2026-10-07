import { test } from "node:test";
import assert from "node:assert/strict";
import { notConfigured } from "./http.ts";

test("without OAUTH_SECRET the endpoints say so plainly instead of failing obscurely", async () => {
  delete process.env.OAUTH_SECRET;
  delete process.env.OAUTH_SECRET_PREVIOUS;
  const res = notConfigured();
  assert.ok(res);
  assert.equal(res!.status, 503);
  assert.match((await res!.json()).error_description, /OAUTH_SECRET/);
});

test("with a valid secret it stays out of the way", () => {
  process.env.OAUTH_SECRET = "n".repeat(40);
  assert.equal(notConfigured(), null);
});

test("a too-short secret counts as not configured", () => {
  process.env.OAUTH_SECRET = "short";
  assert.ok(notConfigured());
});

test("in production a missing or non-https APP_URL is reported, not a bare 500", async () => {
  process.env.OAUTH_SECRET = "n".repeat(40);
  const prev = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = "production";
  try {
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const missing = notConfigured();
    assert.ok(missing);
    assert.match((await missing!.json()).error_description, /APP_URL/);
    process.env.APP_URL = "http://insecure.example";
    assert.ok(notConfigured());
    process.env.APP_URL = "https://ok.example";
    assert.equal(notConfigured(), null);
  } finally {
    (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    delete process.env.APP_URL;
  }
});
