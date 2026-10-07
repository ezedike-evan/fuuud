import crypto from "node:crypto";

/**
 * Sealed, purpose-bound blobs for the OAuth layer.
 *
 * AES-256-GCM, with a key derived by HKDF from OAUTH_SECRET using the PURPOSE as
 * the `info` string, and the purpose also bound as AAD and checked inside the
 * payload. That is three separate guards against token confusion: a sealed
 * `client_id` can never be opened as a pending-authorize cookie, or the reverse,
 * because each purpose derives a different key.
 *
 * Wire format: `kid.iv.tag.ciphertext` (all base64url). `kid` is a short hash of
 * the secret, so OAUTH_SECRET can be rotated: set the new one as OAUTH_SECRET and
 * keep the old one as OAUTH_SECRET_PREVIOUS, and artifacts sealed under either
 * still open while new ones use the current key.
 *
 * This is deliberately NOT lib/memwal-cookie.ts, whose cookie format and key
 * string must not change (it would invalidate every deployed cookie).
 */

const MIN_SECRET_LENGTH = 32;

function secrets(): string[] {
  const list = [process.env.OAUTH_SECRET, process.env.OAUTH_SECRET_PREVIOUS]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  for (const s of list) {
    if (s.length < MIN_SECRET_LENGTH) throw new Error(`OAUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters (openssl rand -hex 32).`);
  }
  return list;
}

const kidOf = (secret: string) => crypto.createHash("sha256").update(`kid:${secret}`).digest("hex").slice(0, 8);

function keyFor(secret: string, purpose: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", secret, "fuuud-oauth-v1", `fuuud:${purpose}`, 32));
}

export const oauthConfigured = () => {
  try {
    return secrets().length > 0;
  } catch {
    return false;
  }
};

export function seal(purpose: string, data: unknown, ttlMs?: number): string {
  const [current] = secrets();
  if (!current) throw new Error("OAUTH_SECRET is not set.");
  const payload = JSON.stringify({ p: purpose, e: ttlMs ? Date.now() + ttlMs : undefined, d: data });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFor(current, purpose), iv);
  cipher.setAAD(Buffer.from(purpose));
  const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return [kidOf(current), iv, cipher.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Returns the data, or null for anything wrong: tampered, expired, wrong purpose, unknown key. */
export function open<T = unknown>(purpose: string, sealed: string | undefined | null): T | null {
  if (!sealed) return null;
  const parts = sealed.split(".");
  if (parts.length !== 4) return null;
  const [kid, iv, tag, ct] = parts;
  try {
    const secret = secrets().find((s) => kidOf(s) === kid);
    if (!secret) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFor(secret, purpose), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const json = Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(json) as { p?: string; e?: number; d?: T };
    if (parsed.p !== purpose) return null;
    if (parsed.e !== undefined && parsed.e < Date.now()) return null;
    return (parsed.d ?? null) as T | null;
  } catch {
    return null;
  }
}

/** HMAC-SHA256 under the current key, purpose-separated. For tokens that must be verifiable without a lookup. */
export function mac(purpose: string, data: string): string {
  const [current] = secrets();
  if (!current) throw new Error("OAUTH_SECRET is not set.");
  return crypto.createHmac("sha256", keyFor(current, `mac:${purpose}`)).update(data).digest("base64url");
}

/** Valid under the current OR previous key, so rotation does not invalidate live tokens. */
export function macValid(purpose: string, data: string, given: string): boolean {
  const g = Buffer.from(given);
  return secrets().some((secret) => {
    const expected = Buffer.from(crypto.createHmac("sha256", keyFor(secret, `mac:${purpose}`)).update(data).digest("base64url"));
    return expected.length === g.length && crypto.timingSafeEqual(expected, g);
  });
}
