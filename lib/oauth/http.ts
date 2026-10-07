import { appUrl, mcpUrl } from "../app-url.ts";
import { oauthConfigured } from "../seal.ts";

/** Response helpers for the OAuth endpoints. Sensitive responses are never cached. */

export const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" } as const;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE, ...headers },
  });
}

/** RFC 6749 section 5.2 error body. */
export function oauthError(error: string, description?: string, status = 400, headers: Record<string, string> = {}): Response {
  return json({ error, ...(description ? { error_description: description } : {}) }, status, headers);
}

/**
 * Discovery documents are public, identical for everyone and fetched
 * cross-origin by some clients, so they may be cached briefly and read from any
 * origin. No credentials are ever involved.
 */
export function metadata(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}

export const SCOPES_HEADER = "memory:read memory:write offline_access";

/**
 * 401 for the MCP endpoint. Claude ignores WWW-Authenticate on a 200, so a
 * missing or bad token MUST be a real 401 carrying the pointer to the
 * protected-resource metadata. Per RFC 6750 the `error` attribute is only
 * present when a token was actually supplied.
 */
export function unauthorized(resourceMetadataUrl: string, tokenSupplied: boolean, description?: string): Response {
  const parts = [`Bearer resource_metadata="${resourceMetadataUrl}"`, `scope="${SCOPES_HEADER}"`];
  if (tokenSupplied) {
    parts.push('error="invalid_token"');
    if (description) parts.push(`error_description="${description.replace(/"/g, "'")}"`);
  }
  return new Response(JSON.stringify({ error: tokenSupplied ? "invalid_token" : "unauthorized" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": parts.join(", "),
      "access-control-expose-headers": "WWW-Authenticate",
      ...NO_STORE,
    },
  });
}

export const protectedResourceMetadataUrl = () => new URL("/.well-known/oauth-protected-resource", mcpUrl()).href;

/** Best available client IP for rate limiting. Prefers the platform's own header over the spoofable X-Forwarded-For. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-vercel-forwarded-for") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * A clear answer when the operator has not set OAUTH_SECRET. Without this the
 * failure surfaces as "unknown client" or a bare 500, and the operator has no way
 * to tell a missing setting from a broken flow.
 */
export function notConfigured(): Response | null {
  let problem: string | null = null;
  if (!oauthConfigured()) problem = "OAUTH_SECRET is not set (or is shorter than 32 characters).";
  else {
    try {
      appUrl();
    } catch (error) {
      problem = error instanceof Error ? error.message : "APP_URL is invalid.";
    }
  }
  if (!problem) return null;
  return json({ error: "server_error", error_description: `The connector is not configured on this server: ${problem}` }, 503);
}
