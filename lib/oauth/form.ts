import { SUPPORTED_SCOPES, type OAuthScope } from "./grants.ts";

/**
 * Parse an application/x-www-form-urlencoded body for the token and revoke
 * endpoints. RFC 6749 section 3.2: a parameter MUST NOT be included more than
 * once, and accepting duplicates is how "which one wins" confusion attacks start.
 */
export async function readForm(req: Request): Promise<{ ok: true; params: URLSearchParams } | { ok: false; description: string }> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") {
    return { ok: false, description: "Content-Type must be application/x-www-form-urlencoded." };
  }
  const raw = await req.text();
  if (raw.length > 8192) return { ok: false, description: "Request body is too large." };
  const params = new URLSearchParams(raw);
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) return { ok: false, description: `Parameter "${key}" appears more than once.` };
    seen.add(key);
  }
  return { ok: true, params };
}

/** `scope` is space-delimited. Unknown scopes are an error, not silently dropped. */
export function parseScopes(raw: string | null): { ok: true; scopes: OAuthScope[] } | { ok: false } {
  if (!raw) return { ok: true, scopes: [] };
  const parts = raw.split(/\s+/).filter(Boolean);
  if (!parts.every((s): s is OAuthScope => (SUPPORTED_SCOPES as readonly string[]).includes(s))) return { ok: false };
  return { ok: true, scopes: [...new Set(parts)] };
}
