import crypto from "node:crypto";

import { appUrl } from "@/lib/app-url.ts";
import { fetchAccountIdForOwner, grpcFor, relayerChain } from "@/lib/account-lookup.ts";
import { keysMatch } from "@/lib/ed25519.ts";
import { kvDel, kvIncr, kvSetNX } from "@/lib/kv.ts";
import { currentScope } from "@/lib/memwal-scope.ts";
import { verifyDelegate } from "@/lib/memwal-verify.ts";
import { healthNs } from "@/lib/namespaces.ts";
import { GrantLimitError, SUPPORTED_SCOPES, createGrant, mintCode, type OAuthScope } from "@/lib/oauth/grants.ts";
import { devMockCreds, devMockEnabled } from "@/lib/oauth/dev.ts";
import { json, notConfigured } from "@/lib/oauth/http.ts";
import { clearPending, readPending } from "@/lib/oauth/pending.ts";
import { readClient } from "@/lib/oauth/clients.ts";
import { getOwnerAddress } from "@/lib/session.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEX64 = /^[0-9a-fA-F]{64}$/;
const APPROVALS_PER_HOUR = 10;

const timingSafeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * The consent decision. This is where a connection actually becomes possible, so
 * it assumes nothing:
 *
 *  - CSRF: must be a same-origin JSON POST, carry the nonce from the sealed cookie
 *    that only this browser holds, and come from a live session.
 *  - The OWNER is the session's address. It is never read from the body.
 *  - The delegate key is checked three ways before it is trusted: the private key
 *    must derive to the public key claimed, the account must be the one this
 *    address owns (looked up onchain, not supplied), and the key must work against
 *    the relayer. A key that was never registered onchain fails the last check.
 *  - Scopes can only be NARROWED from what was requested, never widened.
 *
 * The body contains a private key. It is never logged and never echoed back.
 */
export async function POST(req: Request) {
  const off = notConfigured();
  if (off) return off;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (origin !== appUrl() || (site !== null && site !== "same-origin")) return json({ error: "forbidden" }, 403);
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "invalid_request" }, 415);

  const owner = await getOwnerAddress();
  if (!owner) return json({ error: "not_signed_in" }, 401);

  const raw = await req.text();
  if (raw.length > 4096) return json({ error: "invalid_request" }, 413);
  let body: { nonce?: unknown; deny?: unknown; scopes?: unknown; publicKey?: unknown; privateKey?: unknown; devMock?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const pending = await readPending();
  if (!pending) return json({ error: "expired", message: "That connection request expired. Start again from the app." }, 400);
  if (typeof body.nonce !== "string" || !timingSafeEqual(body.nonce, pending.nonce)) return json({ error: "forbidden" }, 403);

  const redirectWith = (params: Record<string, string>) => {
    const target = new URL(pending.redirectUri);
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    if (pending.state !== undefined) target.searchParams.set("state", pending.state);
    target.searchParams.set("iss", appUrl());
    return target.href;
  };

  if (body.deny === true) {
    await clearPending();
    return json({ redirect: redirectWith({ error: "access_denied", error_description: "The person declined." }) });
  }

  try {
    if ((await kvIncr(`oauth:approve:${owner}`, 3600)) > APPROVALS_PER_HOUR) {
      return json({ error: "rate_limited", message: "Too many connection attempts. Try again later." }, 429);
    }
  } catch (error) {
    console.error("[fuuud] approve rate limit unavailable:", error instanceof Error ? error.message : error);
  }

  // Narrow only. The person may untick write; nothing can be added to what was asked for.
  const chosen = Array.isArray(body.scopes) ? body.scopes.filter((s): s is OAuthScope => (SUPPORTED_SCOPES as readonly string[]).includes(s as string)) : [];
  const scopes = pending.scopes.filter((s) => s === "memory:read" || s === "offline_access" || chosen.includes(s));

  let creds, publicKey: string;
  if (devMockEnabled() && body.devMock === true) {
    creds = devMockCreds(owner);
    publicKey = "dev";
  } else {
    if (typeof body.publicKey !== "string" || typeof body.privateKey !== "string" || !HEX64.test(body.publicKey) || !HEX64.test(body.privateKey)) {
      return json({ error: "invalid_request", message: "A connector key is required." }, 400);
    }
    if (!keysMatch(body.privateKey, body.publicKey)) return json({ error: "invalid_request", message: "That key pair does not match." }, 400);
    // The web app's own key must never double as a connector key: they are meant to be revocable separately.
    if (currentScope()?.creds?.delegatePublicKey.toLowerCase() === body.publicKey.toLowerCase()) {
      return json({ error: "invalid_request", message: "Create a new key for this connection." }, 400);
    }

    const registryId = process.env.MEMWAL_REGISTRY_ID?.trim();
    if (!registryId) return json({ error: "server_error", message: "MEMWAL_REGISTRY_ID is not set." }, 503);
    let accountId: string | null;
    try {
      const chain = await relayerChain(process.env.MEMWAL_SERVER_URL?.trim() || "https://relayer-staging.memory.walrus.xyz");
      accountId = await fetchAccountIdForOwner(grpcFor(chain), registryId, owner);
    } catch (error) {
      console.error("[fuuud] account lookup failed:", error instanceof Error ? error.message : error);
      return json({ error: "temporarily_unavailable", message: "Could not reach Sui. Try again." }, 503);
    }
    if (!accountId) return json({ error: "no_account", message: "Create your memory account first." }, 409);

    const failure = await verifyDelegate({ accountId, delegateKey: body.privateKey, namespace: healthNs(owner) });
    if (failure) return json({ error: "invalid_key", message: "The relayer does not accept that key yet. Wait a few seconds and try again." }, 400);

    creds = { accountId, delegateKey: body.privateKey, delegatePublicKey: body.publicKey.toLowerCase(), owner: owner.toLowerCase() };
    publicKey = body.publicKey.toLowerCase();
  }

  // A consent decision is SINGLE-USE. The pending cookie is sealed and stateless, so
  // deleting it in the browser does not stop a replay of the same value, and a
  // double-click would otherwise make two grants. Claimed only now, after every
  // validation above, so a failed attempt can be retried with the same request.
  const claim = `oauth:approved:${pending.nonce}`;
  try {
    if (!(await kvSetNX(claim, 1, 1800))) {
      return json({ error: "already_used", message: "That connection request was already used. Start again from the app." }, 409);
    }
  } catch (error) {
    console.error("[fuuud] could not claim approval:", error instanceof Error ? error.message : error);
    return json({ error: "temporarily_unavailable", message: "Could not save the connection. Try again." }, 503);
  }

  try {
    const client = readClient(pending.clientId);
    const grant = await createGrant({
      owner,
      clientId: pending.clientId,
      clientName: client?.name ?? "Unnamed app",
      publicKey,
      creds,
      scopes,
      resource: pending.resource,
    });
    const code = await mintCode(grant, { clientId: pending.clientId, redirectUri: pending.redirectUri, challenge: pending.challenge, scopes });
    await clearPending();
    return json({ redirect: redirectWith({ code }) });
  } catch (error) {
    await kvDel(claim).catch(() => {}); // nothing was granted: let the person try again
    if (error instanceof GrantLimitError) return json({ error: "grant_limit", message: error.message }, 409);
    console.error("[fuuud] could not create grant:", error instanceof Error ? error.message : error);
    return json({ error: "temporarily_unavailable", message: "Could not save the connection. Try again." }, 503);
  }
}
