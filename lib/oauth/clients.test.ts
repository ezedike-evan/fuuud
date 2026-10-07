import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readClient, registerClient, sanitizeName } from "./clients.ts";
import { seal } from "../seal.ts";

beforeEach(() => {
  process.env.OAUTH_SECRET = "c".repeat(40);
  delete process.env.OAUTH_REDIRECT_ALLOW;
  delete process.env.OAUTH_ALLOW_LOOPBACK;
});

const CLAUDE = "https://claude.ai/api/mcp/auth_callback";

test("registers a known client and the client_id reads back", () => {
  const r = registerClient({ client_name: "Claude", redirect_uris: [CLAUDE], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(readClient(r.clientId), { name: "Claude", redirectUris: [CLAUDE] });
  assert.equal(r.response.token_endpoint_auth_method, "none");
});

test("keeps the allowed redirect URIs of a mixed registration (Cursor sends several)", () => {
  const r = registerClient({ redirect_uris: ["cursor://anysphere.cursor-mcp/oauth/callback", "http://localhost:8787/callback", "https://evil.com/steal"] });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(readClient(r.clientId)?.redirectUris, ["cursor://anysphere.cursor-mcp/oauth/callback", "http://localhost:8787/callback"]);
});

test("a registration with no allowed redirect URI is refused", () => {
  const r = registerClient({ redirect_uris: ["https://evil.com/steal"] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "invalid_redirect_uri");
});

test("confidential clients and odd grant types are refused", () => {
  assert.equal(registerClient({ redirect_uris: [CLAUDE], token_endpoint_auth_method: "client_secret_basic" }).ok, false);
  assert.equal(registerClient({ redirect_uris: [CLAUDE], grant_types: ["client_credentials"] }).ok, false);
  assert.equal(registerClient({ redirect_uris: [CLAUDE], response_types: ["token"] }).ok, false);
  assert.equal(registerClient(null).ok, false);
  assert.equal(registerClient([]).ok, false);
  assert.equal(registerClient({ redirect_uris: [] }).ok, false);
  assert.equal(registerClient({ redirect_uris: Array(11).fill(CLAUDE) }).ok, false);
});

test("the client name cannot smuggle bidi or control characters onto the consent screen", () => {
  assert.equal(sanitizeName("Claude‮ txen⁦\u0000"), "Claude txen");
  assert.equal(sanitizeName("a\n\tb"), "a b");
  assert.equal(sanitizeName("x".repeat(500)).length, 100);
  assert.equal(sanitizeName(undefined), "Unnamed app");
  assert.equal(sanitizeName("​​"), "Unnamed app");
});

test("a client_id is not forgeable and not interchangeable with other sealed artifacts", () => {
  const r = registerClient({ redirect_uris: [CLAUDE] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const tampered = r.clientId.slice(0, -3) + "AAA";
  assert.equal(readClient(tampered), null);
  assert.equal(readClient("not-a-client-id"), null);
  assert.equal(readClient(undefined), null);
  // A different artifact sealed under the same secret must not pass as a client.
  assert.equal(readClient(seal("pending-authorize", { v: 1, n: "x", r: [CLAUDE] })), null);
  // An unallowed redirect smuggled into a correctly-purposed artifact is still readable here, but can never be USED:
  // the allow-list is re-checked at authorize time (see redirectMatches).
});
