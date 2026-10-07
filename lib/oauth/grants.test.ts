import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  GrantLimitError, MAX_ACTIVE_GRANTS, createGrant, exchangeCode, getGrant, listGrants, mintCode, refreshTokens,
  revokeByToken, revokeGrant, verifyAccess, type Grant, type OAuthScope, type Tokens,
} from "./grants.ts";
import { challengeFor } from "./pkce.ts";
import { kvGet, kvSet } from "../kv.ts";
import { mac } from "../seal.ts";

const VERIFIER = "v".repeat(60);
const CHALLENGE = challengeFor(VERIFIER);
const CLIENT = "client-1";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const RESOURCE = "https://fuuud.test/api/mcp";
const ALL: OAuthScope[] = ["memory:read", "memory:write", "offline_access"];

let n = 0;
const owner = () => `0xowner${++n}`;
const creds = (o: string) => ({ accountId: "0xacc", delegateKey: "ab".repeat(32), delegatePublicKey: "cd".repeat(32), owner: o });

beforeEach(() => {
  process.env.OAUTH_SECRET = "g".repeat(40);
  process.env.APP_URL = "https://fuuud.test";
  delete process.env.OAUTH_SECRET_PREVIOUS;
});

async function newGrant(scopes: OAuthScope[] = ALL, o = owner()): Promise<Grant> {
  return createGrant({ owner: o, clientId: CLIENT, clientName: "Claude", publicKey: "cd".repeat(32), creds: creds(o), scopes, resource: RESOURCE });
}

async function connect(scopes: OAuthScope[] = ALL, o = owner()) {
  const grant = await newGrant(scopes, o);
  const code = await mintCode(grant, { clientId: CLIENT, redirectUri: REDIRECT, challenge: CHALLENGE, scopes });
  const r = await exchangeCode({ code, clientId: CLIENT, redirectUri: REDIRECT, verifier: VERIFIER, resource: RESOURCE });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("exchange failed");
  return { grant, code, tokens: r.tokens, owner: o };
}

const reason = (v: Awaited<ReturnType<typeof verifyAccess>>) => (v.ok ? "ok" : v.reason);

test("a full connection: code -> tokens -> verified access carrying the connector's own credentials", async () => {
  const { tokens, owner: o } = await connect();
  assert.equal(tokens.token_type, "Bearer");
  assert.ok(tokens.expires_in > 3000 && tokens.expires_in <= 3600);
  assert.ok(tokens.refresh_token?.startsWith("rt."));
  assert.equal(tokens.scope, "memory:read memory:write offline_access");
  const v = await verifyAccess(tokens.access_token);
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.creds.owner, o);
    assert.equal(v.creds.accountId, "0xacc");
    assert.deepEqual(v.scopes, ALL);
  }
});

test("neither token contains the delegate key", async () => {
  const { tokens } = await connect();
  for (const t of [tokens.access_token, tokens.refresh_token!]) {
    assert.ok(!t.includes("ab".repeat(32)), "private key must not appear in a token");
  }
});

test("no offline_access, no refresh token", async () => {
  const { tokens } = await connect(["memory:read"]);
  assert.equal(tokens.refresh_token, undefined);
});

test("a code works once; a second use revokes everything issued from it", async () => {
  const { grant, code, tokens } = await connect();
  const again = await exchangeCode({ code, clientId: CLIENT, redirectUri: REDIRECT, verifier: VERIFIER });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.error, "invalid_grant");
  assert.equal(reason(await verifyAccess(tokens.access_token)), "revoked");
  assert.equal(await getGrant(grant.id), null);
});

test("a code is bound to its client, redirect URI, PKCE verifier and resource", async () => {
  const cases: Array<[string, Partial<Parameters<typeof exchangeCode>[0]>, string]> = [
    ["other client", { clientId: "client-2" }, "invalid_grant"],
    ["other redirect", { redirectUri: "https://claude.ai/api/mcp/other" }, "invalid_grant"],
    ["wrong verifier", { verifier: "w".repeat(60) }, "invalid_grant"],
    ["other resource", { resource: "https://other.test/api/mcp" }, "invalid_target"],
  ];
  for (const [label, override, expected] of cases) {
    const grant = await newGrant();
    const code = await mintCode(grant, { clientId: CLIENT, redirectUri: REDIRECT, challenge: CHALLENGE, scopes: ALL });
    const r = await exchangeCode({ code, clientId: CLIENT, redirectUri: REDIRECT, verifier: VERIFIER, resource: RESOURCE, ...override });
    assert.equal(r.ok, false, label);
    if (!r.ok) assert.equal(r.error, expected, label);
  }
});

test("a missing resource is accepted (it defaults to this server), a canonical variant is too", async () => {
  const grant = await newGrant();
  const code = await mintCode(grant, { clientId: CLIENT, redirectUri: REDIRECT, challenge: CHALLENGE, scopes: ALL });
  const r = await exchangeCode({ code, clientId: CLIENT, redirectUri: REDIRECT, verifier: VERIFIER, resource: "HTTPS://Fuuud.test:443/api/mcp/" });
  assert.equal(r.ok, true);
});

test("an unknown code is invalid_grant", async () => {
  const r = await exchangeCode({ code: "nope", clientId: CLIENT, redirectUri: REDIRECT, verifier: VERIFIER });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "invalid_grant");
});

test("refresh rotates, and the old token is accepted once more inside the grace window with the SAME answer", async () => {
  const { tokens } = await connect();
  const first = await refreshTokens({ refreshToken: tokens.refresh_token!, clientId: CLIENT });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.notEqual(first.tokens.refresh_token, tokens.refresh_token);

  // The client never saw that response and retries with the old token.
  const retry = await refreshTokens({ refreshToken: tokens.refresh_token!, clientId: CLIENT });
  assert.equal(retry.ok, true);
  if (retry.ok) assert.equal(retry.tokens.refresh_token, first.tokens.refresh_token);

  // The rotated token keeps working and rotates again.
  const next = await refreshTokens({ refreshToken: first.tokens.refresh_token!, clientId: CLIENT });
  assert.equal(next.ok, true);
});

test("two simultaneous refreshes of the same token both succeed and agree on the new token", async () => {
  const { tokens } = await connect();
  const [a, b] = await Promise.all([
    refreshTokens({ refreshToken: tokens.refresh_token!, clientId: CLIENT }),
    refreshTokens({ refreshToken: tokens.refresh_token!, clientId: CLIENT }),
  ]);
  assert.equal(a.ok && b.ok, true);
  if (a.ok && b.ok) assert.equal(a.tokens.refresh_token, b.tokens.refresh_token);
});

test("replaying a refresh token after the grace window revokes the whole grant", async () => {
  const { grant, tokens } = await connect();
  const first = await refreshTokens({ refreshToken: tokens.refresh_token!, clientId: CLIENT });
  assert.equal(first.ok, true);

  // Age the rotation past the grace window.
  const state = await kvGet<{ current: string; prev: string; prevAt: number; next: string }>(`oauth:rt:${grant.id}`);
  assert.ok(state);
  await kvSet(`oauth:rt:${grant.id}`, { ...state, prevAt: Date.now() - 5 * 60_000 }, 3600);

  const replay = await refreshTokens({ refreshToken: tokens.refresh_token!, clientId: CLIENT });
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.error, "invalid_grant");
  assert.equal(reason(await verifyAccess(tokens.access_token)), "revoked");
  const afterwards = await refreshTokens({ refreshToken: first.ok ? first.tokens.refresh_token! : "", clientId: CLIENT });
  assert.equal(afterwards.ok, false, "even the legitimate newest token is dead once reuse is detected");
});

test("a refresh token cannot be used by another client or to gain scopes", async () => {
  const { tokens } = await connect(["memory:read", "offline_access"]);
  const other = await refreshTokens({ refreshToken: tokens.refresh_token!, clientId: "client-2" });
  assert.equal(other.ok, false);
  const widen = await refreshTokens({ refreshToken: tokens.refresh_token!, clientId: CLIENT, scopes: ["memory:read", "memory:write"] });
  assert.equal(widen.ok, false);
  if (!widen.ok) assert.equal(widen.error, "invalid_scope");
  const narrow = await refreshTokens({ refreshToken: tokens.refresh_token!, clientId: CLIENT, scopes: ["memory:read"] });
  assert.equal(narrow.ok, true);
});

test("malformed refresh tokens are invalid_grant, never an exception", async () => {
  for (const t of ["", "rt", "rt.x.y", "at.a.b.c", "rt.!!.zzzz", "a.b.c.d.e"]) {
    const r = await refreshTokens({ refreshToken: t, clientId: CLIENT });
    assert.equal(r.ok, false, t);
    if (!r.ok) assert.equal(r.error, "invalid_grant", t);
  }
});

test("revoking a grant kills its access and refresh tokens immediately", async () => {
  const { grant, tokens } = await connect();
  await revokeGrant(grant.id);
  assert.equal(reason(await verifyAccess(tokens.access_token)), "revoked");
  const r = await refreshTokens({ refreshToken: tokens.refresh_token!, clientId: CLIENT });
  assert.equal(r.ok, false);
  assert.equal(await getGrant(grant.id), null);
});

test("revoking by token (RFC 7009) works for both token types and ignores junk", async () => {
  const a = await connect();
  await revokeByToken(a.tokens.access_token);
  assert.equal(reason(await verifyAccess(a.tokens.access_token)), "revoked");

  const b = await connect();
  await revokeByToken(b.tokens.refresh_token!);
  assert.equal(reason(await verifyAccess(b.tokens.access_token)), "revoked");

  await assert.doesNotReject(() => revokeByToken("garbage"));
  await assert.doesNotReject(() => revokeByToken("at.x.1.y"));
});

test("access tokens: forged, tampered and expired ones are rejected", async () => {
  const { grant, tokens } = await connect();
  const [, gid, exp, sig] = tokens.access_token.split(".");
  assert.equal(reason(await verifyAccess(`at.${gid}.${exp}.${sig.slice(0, -2)}AA`)), "invalid");
  assert.equal(reason(await verifyAccess(`at.${gid}.${Number(exp) + 3600}.${sig}`)), "invalid"); // extended lifetime, same signature
  assert.equal(reason(await verifyAccess(`at.${grant.id}.${Math.floor(Date.now() / 1000) + 3600}.forged`)), "invalid");
  for (const junk of ["", "at", "x.y.z", "rt.a.b.c", "at.!!.1.x", `at.${gid}.notanumber.${sig}`]) {
    assert.equal(reason(await verifyAccess(junk)), "invalid", junk);
  }
  const past = Math.floor(Date.now() / 1000) - 10;
  assert.equal(reason(await verifyAccess(`at.${grant.id}.${past}.${mac("access-token", `${grant.id}.${past}`)}`)), "expired");
});

test("a grant that was never approved by a code exchange cannot be used as a bearer", async () => {
  const grant = await newGrant();
  const exp = Math.floor(Date.now() / 1000) + 600;
  const token = `at.${grant.id}.${exp}.${mac("access-token", `${grant.id}.${exp}`)}`;
  assert.equal(reason(await verifyAccess(token)), "revoked", "pending grants are not active");
});

test("each person is limited to a handful of connected apps", async () => {
  const o = owner();
  for (let i = 0; i < MAX_ACTIVE_GRANTS; i++) await newGrant(ALL, o);
  await assert.rejects(() => newGrant(ALL, o), GrantLimitError);
  assert.equal((await listGrants(o)).length, MAX_ACTIVE_GRANTS);
  // Someone else is unaffected.
  await assert.doesNotReject(() => newGrant());
});

test("disconnecting frees a slot and removes the grant from the list", async () => {
  const o = owner();
  const grants: Grant[] = [];
  for (let i = 0; i < MAX_ACTIVE_GRANTS; i++) grants.push(await newGrant(ALL, o));
  await revokeGrant(grants[0].id);
  assert.equal((await listGrants(o)).length, MAX_ACTIVE_GRANTS - 1);
  await assert.doesNotReject(() => newGrant(ALL, o));
});

test("an abandoned, never-exchanged grant is reaped instead of counting against the limit forever", async () => {
  const o = owner();
  const old = await newGrant(ALL, o);
  await kvSet(`oauth:grant:${old.id}`, { ...old, created: Date.now() - 2 * 3600_000 }, 3600);
  for (let i = 0; i < MAX_ACTIVE_GRANTS - 1; i++) await newGrant(ALL, o);
  await assert.doesNotReject(() => newGrant(ALL, o));
  assert.equal(await getGrant(old.id), null);
});

test("a token under a different secret fails closed", async () => {
  const { tokens } = await connect();
  process.env.OAUTH_SECRET = "z".repeat(40);
  assert.equal(reason(await verifyAccess(tokens.access_token)), "invalid");
});
