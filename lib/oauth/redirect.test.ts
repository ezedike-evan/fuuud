import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { filterAllowed, isAllowedRedirect, redirectLabel, redirectMatches } from "./redirect.ts";

beforeEach(() => {
  delete process.env.OAUTH_REDIRECT_ALLOW;
  delete process.env.OAUTH_ALLOW_LOOPBACK;
});

test("known client callbacks are allowed", () => {
  for (const uri of [
    "https://claude.ai/api/mcp/auth_callback",
    "https://chatgpt.com/connector_platform_oauth_redirect",
    "https://chatgpt.com/connector/oauth/abc_123-XYZ",
    "cursor://anysphere.cursor-mcp/oauth/callback",
  ]) assert.equal(isAllowedRedirect(uri), true, uri);
});

test("lookalike hosts, userinfo tricks and path variants are refused", () => {
  for (const uri of [
    "https://claude.ai.evil.com/api/mcp/auth_callback",
    "https://evil.com/?next=https://claude.ai/api/mcp/auth_callback",
    "https://claude.ai@evil.com/api/mcp/auth_callback",
    "https://user:pw@claude.ai/api/mcp/auth_callback",
    "http://claude.ai/api/mcp/auth_callback",
    "https://claude.ai/api/mcp/auth_callback/",
    "https://claude.ai/api/mcp/auth_callback#frag",
    "https://chatgpt.com/connector/oauth/a/b",
    "https://chatgpt.com/connector/oauth/",
    "https://chatgpt.com:8443/connector/oauth/abc",
    "javascript:alert(1)",
    "",
    "not a url",
  ]) assert.equal(isAllowedRedirect(uri), false, uri);
});

test("loopback is allowed on any port, but only real loopback hosts", () => {
  for (const uri of ["http://localhost:3118/callback", "http://127.0.0.1:6274/oauth/callback", "http://[::1]:5555/cb"]) {
    assert.equal(isAllowedRedirect(uri), true, uri);
  }
  for (const uri of ["http://localhost.evil.com/cb", "http://127.0.0.1.evil.com/cb", "https://localhost/cb", "http://0.0.0.0/cb", "http://localhost@evil.com/cb"]) {
    assert.equal(isAllowedRedirect(uri), false, uri);
  }
});

test("OAUTH_ALLOW_LOOPBACK=0 turns loopback off", () => {
  process.env.OAUTH_ALLOW_LOOPBACK = "0";
  assert.equal(isAllowedRedirect("http://localhost:3118/callback"), false);
});

test("OAUTH_REDIRECT_ALLOW extends the list without a code change", () => {
  assert.equal(isAllowedRedirect("https://app.example/cb"), false);
  process.env.OAUTH_REDIRECT_ALLOW = "https://app.example/cb, https://other.example/oauth";
  assert.equal(isAllowedRedirect("https://app.example/cb"), true);
  assert.equal(isAllowedRedirect("https://app.example/cb2"), false);
});

test("registration keeps the allowed URIs and drops the rest", () => {
  assert.deepEqual(
    filterAllowed(["https://claude.ai/api/mcp/auth_callback", "https://evil.com/x", 42, "http://localhost:8787/callback"]),
    ["https://claude.ai/api/mcp/auth_callback", "http://localhost:8787/callback"],
  );
});

test("redirectMatches: loopback ignores the port, everything else is exact", () => {
  const reg = ["http://localhost:1111/callback", "https://claude.ai/api/mcp/auth_callback"];
  assert.equal(redirectMatches(reg, "http://localhost:9999/callback"), true);
  assert.equal(redirectMatches(reg, "http://localhost:9999/other"), false);
  assert.equal(redirectMatches(reg, "http://127.0.0.1:1111/callback"), false);
  assert.equal(redirectMatches(reg, "https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(redirectMatches(reg, "https://claude.ai/api/mcp/auth_callback?x=1"), false);
  assert.equal(redirectMatches(["https://evil.com/x"], "https://evil.com/x"), false); // never registered, never allowed
});

test("the consent label names where the grant will go", () => {
  assert.equal(redirectLabel("https://claude.ai/api/mcp/auth_callback"), "claude.ai");
  assert.match(redirectLabel("http://localhost:3118/callback"), /your own computer/);
  assert.match(redirectLabel("cursor://anysphere.cursor-mcp/oauth/callback"), /cursor app/);
});
