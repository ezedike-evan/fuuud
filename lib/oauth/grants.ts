import crypto from "node:crypto";

import { kvDel, kvGet, kvSet, kvSetAdd, kvSetMembers, kvSetNX, kvSetRemove, kvTake } from "../kv.ts";
import { mac, macValid, open, seal } from "../seal.ts";
import { isOurResource } from "../app-url.ts";
import type { MemwalCreds } from "../memwal-scope.ts";
import { verifyPkce } from "./pkce.ts";

/**
 * Grants, authorization codes and tokens.
 *
 * WHAT A GRANT IS. One person connecting one AI app. It holds the connector's own
 * delegate key (sealed under OAUTH_SECRET) and is the unit of revocation: kill the
 * grant and every token minted under it dies.
 *
 * TOKENS carry no key material:
 *   access  `at.<gid>.<expiry>.<hmac>`  - verifiable without a lookup, but still
 *           checked against the grant on every call, so revocation is immediate.
 *   refresh `rt.<gid>.<random>`         - only its hash is stored, in a state
 *           record separate from the grant (see "why two records" below).
 *   code    random, single use, 60 s, stored by hash.
 *
 * WHY TWO RECORDS. Refresh rotation rewrites state on every use. If it shared a
 * record with the grant, a rotation that raced a revocation could write the whole
 * record back and un-revoke it. So the grant is written once (and on activation),
 * rotation state lives in `oauth:rt:<gid>`, and revocation is a separate marker
 * that is checked first and never overwritten.
 *
 * No TypeScript parameter properties or enums: scripts load this through node's
 * strip-only mode.
 */

export const SUPPORTED_SCOPES = ["memory:read", "memory:write", "offline_access"] as const;
export type OAuthScope = (typeof SUPPORTED_SCOPES)[number];

const SECOND = 1000;
const DAY = 86_400;

export const LIFETIMES = {
  codeSeconds: 60,
  accessSeconds: 3600,
  refreshSeconds: 30 * DAY,
  /** However often it refreshes, a connection is re-approved after this long. */
  absoluteSeconds: 90 * DAY,
  /** A retried refresh inside this window gets the SAME new token instead of revoking the grant. */
  graceSeconds: 60,
  /** An approved-but-never-used grant is dropped after this. */
  pendingSeconds: 3600,
  revokedMarkerSeconds: 100 * DAY,
} as const;

export const MAX_ACTIVE_GRANTS = 5;

export type Grant = {
  id: string;
  owner: string;
  clientId: string;
  clientName: string;
  /** The connector's delegate PUBLIC key (hex). The private half is only in `sealedCreds`. */
  publicKey: string;
  sealedCreds: string;
  scopes: OAuthScope[];
  /** Canonical MCP URL this grant is bound to (RFC 8707). */
  resource: string;
  status: "pending" | "active";
  created: number;
  absExp: number;
};

type CodeRecord = {
  gid: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  resource: string;
  scopes: OAuthScope[];
};

type RefreshState = {
  current: string;
  prev?: string;
  prevAt?: number;
  /** The token `prev` was exchanged for, sealed, so an in-grace retry can be answered identically. */
  next?: string;
};

export type Tokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  refresh_token?: string;
};

export type Failure = { ok: false; error: string; description: string; status: number };
const fail = (error: string, description: string, status = 400): Failure => ({ ok: false, error, description, status });
const invalidGrant = (description: string) => fail("invalid_grant", description);

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const random = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const GID = /^[A-Za-z0-9_-]{16,64}$/;

const k = {
  grant: (gid: string) => `oauth:grant:${gid}`,
  revoked: (gid: string) => `oauth:revoked:${gid}`,
  rt: (gid: string) => `oauth:rt:${gid}`,
  owned: (owner: string) => `oauth:grants:${owner.toLowerCase()}`,
  code: (code: string) => `oauth:code:${sha(code)}`,
  codeUsed: (code: string) => `oauth:codeused:${sha(code)}`,
  lock: (gid: string, hash: string) => `oauth:rtlock:${gid}:${hash}`,
};

const now = () => Date.now();

/* --------------------------------- grants --------------------------------- */

export async function getGrant(gid: string): Promise<Grant | null> {
  if (!GID.test(gid)) return null;
  const [revoked, grant] = await Promise.all([kvGet<number>(k.revoked(gid)), kvGet<Grant>(k.grant(gid))]);
  if (revoked || !grant || grant.absExp <= now()) return null;
  return grant;
}

export async function listGrants(owner: string): Promise<Grant[]> {
  const ids = await kvSetMembers(k.owned(owner));
  const found = await Promise.all(ids.map((id) => getGrant(id)));
  // Forget ids whose grant is gone (revoked, expired, never activated), so the set does not grow forever.
  await Promise.all(ids.filter((_, i) => !found[i]).map((id) => kvSetRemove(k.owned(owner), id)));
  return found.filter((g): g is Grant => Boolean(g));
}

export class GrantLimitError extends Error {
  readonly code = "GRANT_LIMIT";
  constructor() {
    super(`You already have ${MAX_ACTIVE_GRANTS} connected apps. Disconnect one in Settings first.`);
    this.name = "GrantLimitError";
  }
}

export async function createGrant(input: {
  owner: string;
  clientId: string;
  clientName: string;
  publicKey: string;
  creds: MemwalCreds;
  scopes: OAuthScope[];
  resource: string;
}): Promise<Grant> {
  const owner = input.owner.toLowerCase();

  const existing = await listGrants(owner);
  // A grant approved but never exchanged is an abandoned flow, not a connection.
  const stale = existing.filter((g) => g.status === "pending" && now() - g.created > LIFETIMES.pendingSeconds * SECOND);
  await Promise.all(stale.map((g) => revokeGrant(g.id)));
  const live = existing.filter((g) => !stale.includes(g));
  if (live.length >= MAX_ACTIVE_GRANTS) throw new GrantLimitError();

  const grant: Grant = {
    id: random(18),
    owner,
    clientId: input.clientId,
    clientName: input.clientName,
    publicKey: input.publicKey,
    sealedCreds: seal("grant-creds", input.creds),
    scopes: input.scopes,
    resource: input.resource,
    status: "pending",
    created: now(),
    absExp: now() + LIFETIMES.absoluteSeconds * SECOND,
  };
  await kvSet(k.grant(grant.id), grant, LIFETIMES.absoluteSeconds);
  await kvSetAdd(k.owned(owner), grant.id);
  return grant;
}

/**
 * A grant that is used by the server itself (the Telegram bot) has no OAuth code
 * exchange to activate it, so it is activated at creation instead. Revocation still
 * wins: the marker is checked before anything is read.
 */
export async function activateGrant(gid: string): Promise<Grant | null> {
  const grant = await getGrant(gid);
  if (!grant) return null;
  if (grant.status === "active") return grant;
  const active: Grant = { ...grant, status: "active" };
  await kvSet(k.grant(gid), active, Math.max(1, Math.floor((grant.absExp - now()) / SECOND)));
  if (await kvGet(k.revoked(gid))) {
    await kvDel(k.grant(gid));
    return null;
  }
  return active;
}

/** Kills the grant and every token under it. The onchain delegate key is separate: remove it with the wallet. */
export async function revokeGrant(gid: string): Promise<void> {
  if (!GID.test(gid)) return;
  const grant = await kvGet<Grant>(k.grant(gid));
  // Marker FIRST: from this moment every token fails, even if the deletes below are slow.
  await kvSet(k.revoked(gid), 1, LIFETIMES.revokedMarkerSeconds);
  await Promise.all([kvDel(k.grant(gid)), kvDel(k.rt(gid))]);
  if (grant) await kvSetRemove(k.owned(grant.owner), gid);
}

/** The credentials a grant speaks with, or null if they cannot be opened. */
export const credsOf = (grant: Grant): MemwalCreds | null => open<MemwalCreds>("grant-creds", grant.sealedCreds);

/* ----------------------------- authorization code ----------------------------- */

export async function mintCode(grant: Grant, input: { clientId: string; redirectUri: string; challenge: string; scopes: OAuthScope[] }): Promise<string> {
  const code = random(32);
  const record: CodeRecord = {
    gid: grant.id,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    challenge: input.challenge,
    resource: grant.resource,
    scopes: input.scopes,
  };
  await kvSet(k.code(code), record, LIFETIMES.codeSeconds);
  return code;
}

/* --------------------------------- tokens ---------------------------------- */

function accessToken(gid: string, expiresAtMs: number): string {
  const exp = Math.floor(expiresAtMs / SECOND);
  return `at.${gid}.${exp}.${mac("access-token", `${gid}.${exp}`)}`;
}

function tokensFor(grant: Grant, refreshToken?: string): Tokens {
  const expiresAt = Math.min(now() + LIFETIMES.accessSeconds * SECOND, grant.absExp);
  return {
    access_token: accessToken(grant.id, expiresAt),
    token_type: "Bearer",
    expires_in: Math.max(1, Math.floor((expiresAt - now()) / SECOND)),
    scope: grant.scopes.join(" "),
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  };
}

const wantsRefresh = (grant: Grant) => grant.scopes.includes("offline_access");

export async function exchangeCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  verifier: string;
  resource?: string;
}): Promise<{ ok: true; tokens: Tokens; grant: Grant } | Failure> {
  const record = await kvTake<CodeRecord>(k.code(input.code));

  if (!record) {
    // A code that existed and is now gone was already used. RFC 6749 section 4.1.2:
    // when that happens, revoke everything issued from it.
    const used = await kvGet<{ gid: string }>(k.codeUsed(input.code));
    if (used) await revokeGrant(used.gid);
    return invalidGrant("The authorization code is invalid, expired or already used.");
  }
  await kvSet(k.codeUsed(input.code), { gid: record.gid }, 600);

  if (record.clientId !== input.clientId) return invalidGrant("The code was issued to a different client.");
  if (record.redirectUri !== input.redirectUri) return invalidGrant("redirect_uri does not match the authorization request.");
  if (!verifyPkce(input.verifier, record.challenge)) return invalidGrant("PKCE verification failed.");
  if (input.resource !== undefined && !isOurResource(input.resource)) {
    return fail("invalid_target", "resource does not identify this server.");
  }

  const grant = await getGrant(record.gid);
  if (!grant) return invalidGrant("The grant was revoked or has expired.");

  if (grant.status === "pending") {
    const active: Grant = { ...grant, status: "active" };
    await kvSet(k.grant(grant.id), active, Math.max(1, Math.floor((grant.absExp - now()) / SECOND)));
    // A revoke that landed between the read and the write must win.
    if (await kvGet(k.revoked(grant.id))) {
      await kvDel(k.grant(grant.id));
      return invalidGrant("The grant was revoked.");
    }
    return finishCodeExchange(active);
  }
  return finishCodeExchange(grant);
}

async function finishCodeExchange(grant: Grant): Promise<{ ok: true; tokens: Tokens; grant: Grant }> {
  let refresh: string | undefined;
  if (wantsRefresh(grant)) {
    refresh = `rt.${grant.id}.${random(32)}`;
    const state: RefreshState = { current: sha(refresh) };
    await kvSet(k.rt(grant.id), state, refreshTtl(grant));
  }
  return { ok: true, tokens: tokensFor(grant, refresh), grant };
}

const refreshTtl = (grant: Grant) => Math.max(1, Math.min(LIFETIMES.refreshSeconds, Math.floor((grant.absExp - now()) / SECOND)));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rotate a refresh token.
 *
 *  - the CURRENT token: rotate it, remember it as `prev`, hand back a new one;
 *  - the token we just replaced, within the grace window: answer with the SAME new
 *    token (the client's first response may never have arrived - Claude retries);
 *  - anything older, or `prev` after the window: someone is replaying a stolen
 *    token. Revoke the whole grant.
 *
 * Two refreshes of the same token at the same instant are serialised by a
 * set-if-absent lock, so exactly one rotates.
 */
export async function refreshTokens(input: { refreshToken: string; clientId: string; scopes?: OAuthScope[] }): Promise<{ ok: true; tokens: Tokens; grant: Grant } | Failure> {
  const parts = input.refreshToken.split(".");
  if (parts.length !== 3 || parts[0] !== "rt" || !GID.test(parts[1])) return invalidGrant("Unknown refresh token.");
  const gid = parts[1];
  const hash = sha(input.refreshToken);

  const grant = await getGrant(gid);
  if (!grant) return invalidGrant("The grant was revoked or has expired.");
  if (grant.clientId !== input.clientId) return invalidGrant("The refresh token was issued to a different client.");
  if (!wantsRefresh(grant)) return invalidGrant("This grant has no refresh token.");

  if (input.scopes && !input.scopes.every((s) => grant.scopes.includes(s))) {
    return fail("invalid_scope", "A refreshed token cannot gain scopes the grant does not have.");
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await kvGet<RefreshState>(k.rt(gid));
    if (!state) return invalidGrant("The refresh token has expired.");

    if (state.current === hash) {
      if (!(await kvSetNX(k.lock(gid, hash), 1, 30))) {
        // Another request is rotating this very token. Give it a moment, then re-read.
        await sleep(400);
        continue;
      }
      const next = `rt.${gid}.${random(32)}`;
      const rotated: RefreshState = {
        current: sha(next),
        prev: hash,
        prevAt: now(),
        next: seal("refresh-grace", next, (LIFETIMES.graceSeconds + 30) * SECOND),
      };
      await kvSet(k.rt(gid), rotated, refreshTtl(grant));
      if (await kvGet(k.revoked(gid))) {
        await kvDel(k.rt(gid));
        return invalidGrant("The grant was revoked.");
      }
      return { ok: true, tokens: tokensFor(grant, next), grant };
    }

    if (state.prev === hash && state.prevAt !== undefined && now() - state.prevAt <= LIFETIMES.graceSeconds * SECOND) {
      const next = state.next ? open<string>("refresh-grace", state.next) : null;
      if (!next) return invalidGrant("The refresh token was already used.");
      return { ok: true, tokens: tokensFor(grant, next), grant };
    }

    // Not the current token, and not the one we just replaced: a replay.
    await revokeGrant(gid);
    return invalidGrant("The refresh token was already used. The connection has been revoked; connect again.");
  }
  return fail("temporarily_unavailable", "Another request is refreshing this token. Try again.", 503);
}

/* ----------------------------- verifying access ----------------------------- */

export type Verified =
  | { ok: true; grant: Grant; creds: MemwalCreds; scopes: OAuthScope[] }
  | { ok: false; reason: "invalid" | "expired" | "revoked" };

/** A KV failure THROWS: the caller must answer 503, never 401, or a client would drop a good connection. */
export async function verifyAccess(token: string): Promise<Verified> {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "at") return { ok: false, reason: "invalid" };
  const [, gid, expRaw, sig] = parts;
  if (!GID.test(gid) || !/^\d{1,12}$/.test(expRaw)) return { ok: false, reason: "invalid" };
  if (!macValid("access-token", `${gid}.${expRaw}`, sig)) return { ok: false, reason: "invalid" };
  if (Number(expRaw) * SECOND <= now()) return { ok: false, reason: "expired" };

  const grant = await getGrant(gid);
  if (!grant || grant.status !== "active") return { ok: false, reason: "revoked" };
  const creds = credsOf(grant);
  if (!creds) return { ok: false, reason: "invalid" };
  return { ok: true, grant, creds, scopes: grant.scopes };
}

/** RFC 7009. Quietly succeeds for anything it does not recognise. */
export async function revokeByToken(token: string): Promise<void> {
  const parts = token.split(".");
  if (parts.length === 4 && parts[0] === "at" && macValid("access-token", `${parts[1]}.${parts[2]}`, parts[3])) {
    return revokeGrant(parts[1]);
  }
  if (parts.length === 3 && parts[0] === "rt" && GID.test(parts[1])) {
    const state = await kvGet<RefreshState>(k.rt(parts[1]));
    const hash = sha(token);
    if (state && (state.current === hash || state.prev === hash)) return revokeGrant(parts[1]);
  }
}
