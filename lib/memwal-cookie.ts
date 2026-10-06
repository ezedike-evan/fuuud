import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { enterScope, type MemwalCreds } from "./memwal-scope.ts";

/**
 * The person's delegate key, sealed in their own httpOnly cookie.
 *
 * Same construction and the same trade-off as ./keys (AES-256-GCM under a key
 * derived from SESSION_SECRET): the only copy lives in their browser, out of
 * reach of page scripts, and a tampered cookie fails to open. It is NOT
 * protection against someone who controls this server - and a delegate key can
 * be revoked onchain by the owner, which is exactly why it is the right thing
 * for this app to hold and the owner key is not.
 *
 * Domain-separated from the provider-key cipher so the two cookies cannot be
 * substituted for one another.
 */
export const MEMWAL_COOKIE = "km_memwal";

export const MEMWAL_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
} as const;

function cipherKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to store a delegate key");
  return crypto.createHash("sha256").update(`km-memwal-delegate:${secret}`).digest();
}

export function sealCreds(creds: MemwalCreds): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(creds), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function openCreds(cookie: string | undefined): MemwalCreds | null {
  if (!cookie) return null;
  try {
    const [iv, tag, body] = cookie.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !body) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", cipherKey(), iv);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"));
    const { accountId, delegateKey, delegatePublicKey, owner } = parsed ?? {};
    if (![accountId, delegateKey, delegatePublicKey, owner].every((v) => typeof v === "string" && v)) return null;
    return { accountId, delegateKey, delegatePublicKey, owner: owner.toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * Called once the session address is known. Binds that person's credentials for
 * the rest of the request.
 *
 * Credentials sealed for a DIFFERENT address are ignored: signing out and in as
 * someone else on the same browser must never reach the first person's record.
 */
export async function bindMemwal(address: string): Promise<MemwalCreds | null> {
  let creds: MemwalCreds | null = null;
  try {
    const jar = await cookies();
    const opened = openCreds(jar.get(MEMWAL_COOKIE)?.value);
    if (opened && opened.owner === address.toLowerCase()) creds = opened;
  } catch {
    // Outside a request (build-time evaluation). No creds, no scope.
  }
  enterScope({ creds });
  return creds;
}
