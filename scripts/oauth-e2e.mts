/**
 * End-to-end test of the hosted MCP connector, over real HTTP.
 *
 *   # terminal 1 - dev server on the offline mock memory, no keys needed
 *   APP_URL=http://localhost:3002 OAUTH_SECRET=$(openssl rand -hex 32) SESSION_SECRET=x \
 *   DEV_FAKE_ADDRESS=0xe2e pnpm dev
 *
 *   # terminal 2
 *   APP_URL=http://localhost:3002 pnpm oauth:e2e
 *
 * It plays the part of an AI client: discover, register, send the person through
 * authorize + consent (using the dev-only mock path, which skips the wallet), swap
 * the code for tokens, call every tool, refresh, replay, and revoke. What it can
 * NOT cover is the wallet signing the real consent screen does; that needs a real
 * browser session and is checked by hand (see README).
 */
import crypto from "node:crypto";
import { OAuthMetadataSchema, OAuthProtectedResourceMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";

const BASE = (process.env.APP_URL || "http://localhost:3002").replace(/\/$/, "");
const MCP = `${BASE}/api/mcp`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  - ${detail}` : ""}`);
  if (!ok) failures++;
}
const section = (s: string) => console.log(`\n== ${s}`);

const b64url = (b: Buffer) => b.toString("base64url");
const verifier = b64url(crypto.randomBytes(48));
const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());

async function rpc(token: string | null, method: string, params: unknown = {}, id: number | null = 1) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }), ...(id === null ? {} : { id }) }),
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* leave null */ }
  return { res, body, text };
}

const callTool = async (token: string, name: string, args: unknown) => {
  const r = await rpc(token, "tools/call", { name, arguments: args }, 7);
  return { ...r, text: r.body?.result?.content?.[0]?.text as string | undefined, isError: Boolean(r.body?.result?.isError) };
};

async function form(path: string, params: Record<string, string>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return { res, body: (await res.json().catch(() => null)) as any };
}

section("1. An unauthenticated request is a real 401 that points at the metadata");
const unauth = await rpc(null, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
check("POST without a token is 401", unauth.res.status === 401, String(unauth.res.status));
const wwwAuth = unauth.res.headers.get("www-authenticate") ?? "";
const metadataUrl = /resource_metadata="([^"]+)"/.exec(wwwAuth)?.[1];
check("WWW-Authenticate carries resource_metadata", Boolean(metadataUrl), wwwAuth);
check("no error attribute when no token was sent", !wwwAuth.includes("error="));
const get401 = await fetch(MCP, { method: "GET" });
check("GET without a token is ALSO 401, not 405 (auth comes first)", get401.status === 401, String(get401.status));
const del401 = await fetch(MCP, { method: "DELETE" });
check("DELETE without a token is 401", del401.status === 401);
const evilOrigin = await fetch(MCP, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
check("a browser Origin that is not allow-listed is refused", evilOrigin.status === 403, String(evilOrigin.status));

section("2. Discovery documents validate against the MCP SDK's own schemas");
const prmRes = await fetch(metadataUrl!);
const prmRaw = await prmRes.json();
const prm = OAuthProtectedResourceMetadataSchema.safeParse(prmRaw);
check("protected-resource metadata parses", prm.success);
check("resource equals the MCP URL exactly", prmRaw.resource === MCP, prmRaw.resource);
const asRes = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
const asRaw = await asRes.json();
check("authorization-server metadata parses", OAuthMetadataSchema.safeParse(asRaw).success);
check("issuer matches the protected resource's authorization_servers[0]", asRaw.issuer === prmRaw.authorization_servers[0]);
check("S256 only, public clients, iss parameter, offline_access",
  JSON.stringify(asRaw.code_challenge_methods_supported) === '["S256"]' &&
  asRaw.token_endpoint_auth_methods_supported.includes("none") &&
  asRaw.authorization_response_iss_parameter_supported === true &&
  asRaw.scopes_supported.includes("offline_access"));
const alt = await fetch(`${BASE}/.well-known/oauth-protected-resource/api/mcp`);
check("path-suffixed protected-resource metadata also resolves", alt.status === 200);

section("3. Dynamic client registration");
const reg = await fetch(asRaw.registration_endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "E2E Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
});
const client = await reg.json();
check("registration succeeds with 201", reg.status === 201 && Boolean(client.client_id));
const evilReg = await fetch(asRaw.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://evil.example/cb"] }) });
check("a client with a non-allow-listed redirect is refused", evilReg.status === 400);

section("4. Authorize: bad requests never redirect to an unvalidated URI");
const authorizeUrl = (over: Record<string, string> = {}) => {
  const u = new URL(asRaw.authorization_endpoint);
  const p: Record<string, string> = {
    response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge,
    code_challenge_method: "S256", state: "st-123", scope: "memory:read memory:write offline_access", resource: MCP, ...over,
  };
  for (const [k, v] of Object.entries(p)) if (v !== "") u.searchParams.set(k, v);
  return u.href;
};
const noFollow = (url: string, headers: Record<string, string> = {}) => fetch(url, { redirect: "manual", headers });

const badRedirect = await noFollow(authorizeUrl({ redirect_uri: "https://evil.example/cb" }));
check("an unregistered redirect_uri goes to OUR error page", (badRedirect.headers.get("location") ?? "").includes("/oauth/error?reason=bad_redirect"));
const badClient = await noFollow(authorizeUrl({ client_id: "forged" }));
check("a forged client_id goes to OUR error page", (badClient.headers.get("location") ?? "").includes("/oauth/error?reason=unknown_client"));
const noPkce = await noFollow(authorizeUrl({ code_challenge: "" }));
const noPkceLoc = new URL(noPkce.headers.get("location") ?? "http://x");
check("missing PKCE errors back to the validated redirect, with state and iss",
  noPkceLoc.origin + noPkceLoc.pathname === REDIRECT && noPkceLoc.searchParams.get("error") === "invalid_request" &&
  noPkceLoc.searchParams.get("state") === "st-123" && noPkceLoc.searchParams.get("iss") === BASE);
const plain = await noFollow(authorizeUrl({ code_challenge_method: "plain" }));
check("PKCE plain is refused", new URL(plain.headers.get("location") ?? "http://x").searchParams.get("error") === "invalid_request");
const wrongResource = await noFollow(authorizeUrl({ resource: "https://other.example/api/mcp" }));
check("a resource for another server is invalid_target", new URL(wrongResource.headers.get("location") ?? "http://x").searchParams.get("error") === "invalid_target");
const dup = await noFollow(authorizeUrl() + "&state=again");
check("a duplicated parameter is refused", (dup.headers.get("location") ?? "").includes("/oauth/error?reason=invalid_request"));

section("5. Authorize -> consent -> approve (dev mock: no wallet)");
const authz = await noFollow(authorizeUrl());
check("a valid request is parked and sent to /oauth/consent", (authz.headers.get("location") ?? "").endsWith("/oauth/consent"));
const pendingCookie = (authz.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("km_oauth_pending="));
check("the pending request is a sealed cookie", Boolean(pendingCookie));
const consentRes = await fetch(`${BASE}/oauth/consent`, { headers: { cookie: pendingCookie! } });
const consentHtml = await consentRes.text();
check("the consent page renders", consentRes.status === 200 && consentHtml.includes("E2E Claude"));
check("the consent page cannot be framed", (consentRes.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'") && consentRes.headers.get("x-frame-options") === "DENY");
const nonce = /\\?"nonce\\?":\\?"([A-Za-z0-9_-]{16,})\\?"/.exec(consentHtml)?.[1];
check("the consent page carries the nonce for this browser", Boolean(nonce));

const approve = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}/oauth/approve`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie: pendingCookie!, ...headers }, body: JSON.stringify(body) });

const crossSite = await approve({ nonce, devMock: true }, { origin: "https://evil.example" });
check("approve refuses a cross-site POST", crossSite.status === 403);
const badNonce = await approve({ nonce: "wrong-nonce-value-1234", devMock: true });
check("approve refuses a wrong nonce", badNonce.status === 403);
const formPost = await fetch(`${BASE}/oauth/approve`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, cookie: pendingCookie! }, body: `nonce=${nonce}` });
check("approve refuses a non-JSON body", formPost.status === 415);

const approved = await approve({ nonce, devMock: true, scopes: ["memory:read", "memory:write", "offline_access"] });
const approvedBody = await approved.json();
check("approve returns the redirect with a code", approved.status === 200 && Boolean(approvedBody.redirect), JSON.stringify(approvedBody).slice(0, 120));
const back = new URL(approvedBody.redirect);
const code = back.searchParams.get("code")!;
check("the redirect carries code, state and iss and goes to the registered URI",
  back.origin + back.pathname === REDIRECT && Boolean(code) && back.searchParams.get("state") === "st-123" && back.searchParams.get("iss") === BASE);
const secondApprove = await approve({ nonce, devMock: true });
check("the same consent request cannot be approved twice, even with the cookie replayed", secondApprove.status === 409, String(secondApprove.status));

section("6. Token endpoint");
const tokenWith = (over: Record<string, string> = {}) => form("/oauth/token", {
  grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: verifier, resource: MCP, ...over,
});
const wrongVerifier = await form("/oauth/token", { grant_type: "authorization_code", code: "x", client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: "w".repeat(60) });
check("an unknown code is invalid_grant", wrongVerifier.res.status === 400 && wrongVerifier.body?.error === "invalid_grant");
const jsonBody = await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
check("the token endpoint refuses JSON", jsonBody.status === 400);

const exchanged = await tokenWith();
check("the code exchanges for tokens", exchanged.res.status === 200 && Boolean(exchanged.body?.access_token), JSON.stringify(exchanged.body).slice(0, 80));
check("token response is no-store and Bearer", exchanged.res.headers.get("cache-control") === "no-store" && exchanged.body?.token_type === "Bearer");
check("a refresh token was issued (offline_access)", String(exchanged.body?.refresh_token).startsWith("rt."));
const access: string = exchanged.body.access_token;
const refresh: string = exchanged.body.refresh_token;

section("7. The hosted MCP server, authenticated");
const init = await rpc(access, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
check("initialize succeeds", init.res.status === 200 && init.body?.result?.serverInfo?.name === "fuuud", JSON.stringify(init.body?.result?.serverInfo));
check("no session id is issued (stateless)", !init.res.headers.get("mcp-session-id"));
const notif = await rpc(access, "notifications/initialized", undefined, null);
check("a notification is accepted with 202", notif.res.status === 202, String(notif.res.status));
const list = await rpc(access, "tools/list");
const names = (list.body?.result?.tools ?? []).map((t: any) => t.name).sort();
check("all five tools are advertised", names.join(",") === "check_meal,forget_fact,list_memory,recall_memory,remember_fact", names.join(","));
const annotations = Object.fromEntries((list.body?.result?.tools ?? []).map((t: any) => [t.name, t.annotations ?? {}]));
check("forget_fact is marked destructive, recall is read-only", annotations.forget_fact?.destructiveHint === true && annotations.recall_memory?.readOnlyHint === true);
check("a GET with a valid token is 405 (no standalone stream)", (await fetch(MCP, { headers: { authorization: `Bearer ${access}` } })).status === 405);

const safe1 = await callTool(access, "check_meal", { meal: "jollof rice with chicken" });
check("check_meal: SAFE while nothing is stored", Boolean(safe1.text?.startsWith("SAFE")), safe1.text?.slice(0, 40));
const wrote = await callTool(access, "remember_fact", { kind: "allergy", fact: "groundnuts - hives" });
check("remember_fact stores an asserted allergy", Boolean(wrote.text?.startsWith("Stored")) && !wrote.isError, wrote.text?.slice(0, 50));
const dupe = await callTool(access, "remember_fact", { kind: "allergy", fact: "groundnuts - hives" });
check("the identical fact is skipped, not duplicated", Boolean(dupe.text?.startsWith("Already known")));
const unsafe = await callTool(access, "check_meal", { meal: "moi moi with kuli kuli" });
check("check_meal now flags the stored allergen: UNSAFE", Boolean(unsafe.text?.startsWith("UNSAFE")), unsafe.text?.slice(0, 40));
const recalled = await callTool(access, "recall_memory", { query: "what are they allergic to?" });
check("recall_memory returns it", Boolean(recalled.text?.includes("groundnuts")));
check("tool output does not leak the owner's address or namespaces", !(recalled.text ?? "").includes("0xe2e") && !(recalled.text ?? "").includes("kitchen:"));

const noConfirm = await callTool(access, "forget_fact", { fact: "groundnuts - hives" });
check("forget_fact REFUSES without confirm_user_asked", noConfirm.isError && /confirm_user_asked/.test(noConfirm.text ?? ""));
const stillUnsafe = await callTool(access, "check_meal", { meal: "kuli kuli" });
check("...and the allergy is still enforced afterwards", Boolean(stillUnsafe.text?.startsWith("UNSAFE")));
const vague = await callTool(access, "forget_fact", { fact: "my peanut thing", confirm_user_asked: true });
check("a vague retraction retracts NOTHING and lists what is stored so the caller can retry exactly",
  Boolean(vague.text?.includes("No stored fact matches")) && Boolean(vague.text?.includes("groundnuts - hives")), vague.text?.slice(0, 60));
const stillBlocked = await callTool(access, "check_meal", { meal: "kuli kuli" });
check("...so the allergy is untouched", Boolean(stillBlocked.text?.startsWith("UNSAFE")));
const forgot = await callTool(access, "forget_fact", { fact: "groundnuts - hives", confirm_user_asked: true });
check("forget_fact works when the person asked", Boolean(forgot.text?.startsWith("Retracted")), JSON.stringify(forgot.text));
const afterForget = await callTool(access, "check_meal", { meal: "kuli kuli" });
check("a retracted allergy no longer blocks", Boolean(afterForget.text?.startsWith("SAFE")));
const listed = await callTool(access, "list_memory", {});
check("list_memory still shows the retraction, separately", Boolean(listed.text?.includes("RETRACTED")));
check("no reflected owner/namespace in list_memory", !(listed.text ?? "").includes("kitchen:"));

section("8. Refresh rotation, grace and replay");
const r1 = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: refresh, client_id: client.client_id });
check("refresh returns new tokens", r1.res.status === 200 && r1.body?.refresh_token && r1.body.refresh_token !== refresh);
const r1retry = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: refresh, client_id: client.client_id });
check("a retry of the OLD token inside the grace window gets the SAME new token", r1retry.body?.refresh_token === r1.body.refresh_token);
const widen = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: r1.body.refresh_token, client_id: client.client_id, scope: "memory:read admin" });
check("an unknown scope on refresh is invalid_scope", widen.body?.error === "invalid_scope");
const otherClient = await fetch(asRaw.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [REDIRECT] }) }).then((r) => r.json());
const stolen = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: r1.body.refresh_token, client_id: otherClient.client_id });
check("a refresh token cannot be used by a different client", stolen.body?.error === "invalid_grant");
const withNew = await rpc(r1.body.access_token, "tools/list");
check("the new access token works", withNew.res.status === 200);

section("9. Code replay revokes what the code produced");
const replay = await tokenWith();
check("reusing the authorization code fails", replay.body?.error === "invalid_grant");
const afterReplay = await rpc(r1.body.access_token, "tools/list");
check("...and revokes the connection (RFC 6749 4.1.2)", afterReplay.res.status === 401, String(afterReplay.res.status));
check("the 401 now says invalid_token", /error="invalid_token"/.test(afterReplay.res.headers.get("www-authenticate") ?? ""));

section("10. Explicit revocation (RFC 7009)");
const second = await (async () => {
  const a = await noFollow(authorizeUrl({ state: "st-2" }));
  const cookie = (a.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("km_oauth_pending="))!;
  const html = await (await fetch(`${BASE}/oauth/consent`, { headers: { cookie } })).text();
  const n = /\\?"nonce\\?":\\?"([A-Za-z0-9_-]{16,})\\?"/.exec(html)![1];
  const ap = await (await fetch(`${BASE}/oauth/approve`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie }, body: JSON.stringify({ nonce: n, devMock: true, scopes: ["memory:read", "offline_access"] }) })).json();
  const c2 = new URL(ap.redirect).searchParams.get("code")!;
  return form("/oauth/token", { grant_type: "authorization_code", code: c2, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: verifier });
})();
check("a read-only connection can be made", second.res.status === 200, String(second.res.status));
const roAccess: string = second.body.access_token;
const roWrite = await callTool(roAccess, "remember_fact", { kind: "allergy", fact: "shellfish - swelling" });
check("a read-only grant cannot write", roWrite.isError && /write access/.test(roWrite.text ?? ""));
const roRead = await callTool(roAccess, "recall_memory", { query: "anything" });
check("...but can read", !roRead.isError);
const revoked = await form("/oauth/revoke", { token: roAccess });
check("revoke answers 200", revoked.res.status === 200);
check("a revoked token is dead immediately", (await rpc(roAccess, "tools/list")).res.status === 401);
check("revoking junk is still 200 (no probing)", (await form("/oauth/revoke", { token: "junk" })).res.status === 200);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
