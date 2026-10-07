import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { OAuthMetadataSchema, OAuthProtectedResourceMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { authorizationServerMetadata, protectedResourceMetadata } from "./metadata.ts";
import { unauthorized } from "./http.ts";

beforeEach(() => {
  process.env.APP_URL = "https://fuuud.example.com";
});

test("protected-resource metadata parses with the MCP SDK's own schema and names exactly the MCP URL", () => {
  const raw = protectedResourceMetadata();
  const doc = OAuthProtectedResourceMetadataSchema.parse(raw);
  assert.equal(String(doc.resource), "https://fuuud.example.com/api/mcp");
  assert.equal(doc.authorization_servers?.length, 1);
  // The SDK parses URLs into objects (adding a trailing slash); what is SERVED must be the exact
  // issuer string, because clients compare it to the authorization server's own `issuer`.
  assert.deepEqual(raw.authorization_servers, ["https://fuuud.example.com"]);
  assert.equal(raw.authorization_servers[0], authorizationServerMetadata().issuer);
  assert.equal(raw.resource, "https://fuuud.example.com/api/mcp");
});

test("authorization-server metadata parses with the SDK schema and advertises what Claude and ChatGPT check", () => {
  const raw = authorizationServerMetadata();
  const doc = OAuthMetadataSchema.parse(raw);
  assert.equal(raw.issuer, "https://fuuud.example.com");
  assert.deepEqual(doc.code_challenge_methods_supported, ["S256"]);
  assert.ok(doc.token_endpoint_auth_methods_supported?.includes("none"));
  assert.ok(doc.scopes_supported?.includes("offline_access"));
  assert.ok(raw.registration_endpoint.endsWith("/oauth/register"));
  assert.equal(raw.authorization_response_iss_parameter_supported, true);
  // Every endpoint lives on the issuer's own origin.
  for (const key of ["authorization_endpoint", "token_endpoint", "registration_endpoint", "revocation_endpoint"] as const) {
    assert.ok(raw[key].startsWith(`${raw.issuer}/`), key);
  }
});

test("the 401 points at the metadata, and only says invalid_token when a token was actually sent", async () => {
  const none = unauthorized("https://fuuud.example.com/.well-known/oauth-protected-resource", false);
  assert.equal(none.status, 401);
  const h = none.headers.get("www-authenticate")!;
  assert.match(h, /^Bearer resource_metadata="https:\/\/fuuud\.example\.com\/\.well-known\/oauth-protected-resource"/);
  assert.ok(!h.includes("invalid_token"));
  assert.equal(none.headers.get("cache-control"), "no-store");

  const bad = unauthorized("https://x/.well-known/oauth-protected-resource", true, 'bad "token"');
  assert.match(bad.headers.get("www-authenticate")!, /error="invalid_token"/);
  assert.ok(!bad.headers.get("www-authenticate")!.includes('"token"'), "quotes in the description must not break the header");
});
