import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { appUrl, canonicalResource, isOurResource, mcpUrl } from "./app-url.ts";

beforeEach(() => {
  process.env.APP_URL = "https://Fuuud.Example.com/";
  delete process.env.NEXT_PUBLIC_APP_URL;
});

test("the origin is canonical: lowercase host, no trailing slash", () => {
  assert.equal(appUrl(), "https://fuuud.example.com");
  assert.equal(mcpUrl(), "https://fuuud.example.com/api/mcp");
});

test("canonicalResource follows RFC 8707", () => {
  assert.equal(canonicalResource("HTTPS://Fuuud.Example.com:443/api/mcp/"), "https://fuuud.example.com/api/mcp");
  assert.equal(canonicalResource("https://fuuud.example.com/api/mcp#frag"), "https://fuuud.example.com/api/mcp");
  assert.equal(canonicalResource("https://fuuud.example.com/api/mcp?x=1"), null);
  assert.equal(canonicalResource("ftp://x/y"), null);
  assert.equal(canonicalResource("nope"), null);
});

test("a client may type the resource differently and still be recognised", () => {
  assert.equal(isOurResource("https://fuuud.example.com/api/mcp"), true);
  assert.equal(isOurResource("https://FUUUD.example.com:443/api/mcp/"), true);
  assert.equal(isOurResource("https://fuuud.example.com/api/other"), false);
  assert.equal(isOurResource("https://evil.example.com/api/mcp"), false);
});

test("production insists on https", () => {
  const prev = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = "production";
  try {
    process.env.APP_URL = "http://fuuud.example.com";
    assert.throws(() => appUrl(), /https/);
    delete process.env.APP_URL;
    assert.throws(() => appUrl(), /APP_URL is required/);
  } finally {
    (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
  }
});
