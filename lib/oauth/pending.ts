import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { open, seal } from "../seal.ts";
import type { OAuthScope } from "./grants.ts";

/**
 * The authorize request, parked in a sealed httpOnly cookie while the person signs
 * in and creates their account.
 *
 * Why a cookie and not a `?next=` parameter: sign-in goes through a Google
 * redirect pinned to `<origin>/signin`, which drops any query string on the way
 * back. The cookie survives the whole detour. The request was fully validated
 * before it was stored, so nothing in here is re-trusted from a URL.
 *
 * `nonce` ties the consent form to THIS cookie: the approve endpoint requires it
 * back in the request body, so a forged cross-site POST cannot approve anything.
 */
export const PENDING_COOKIE = "km_oauth_pending";
const PURPOSE = "pending-authorize";
const TTL_MS = 30 * 60 * 1000;

export type Pending = {
  clientId: string;
  redirectUri: string;
  state?: string;
  challenge: string;
  scopes: OAuthScope[];
  resource: string;
  nonce: string;
};

const OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TTL_MS / 1000,
} as const;

/** Route handlers and server actions only: Server Components cannot set cookies. */
export async function setPending(input: Omit<Pending, "nonce">): Promise<Pending> {
  const pending: Pending = { ...input, nonce: crypto.randomBytes(16).toString("base64url") };
  (await cookies()).set(PENDING_COOKIE, seal(PURPOSE, pending, TTL_MS), OPTIONS);
  return pending;
}

export async function readPending(): Promise<Pending | null> {
  const value = (await cookies()).get(PENDING_COOKIE)?.value;
  return open<Pending>(PURPOSE, value);
}

export async function clearPending(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}

export const hasPending = async () => (await readPending()) !== null;
