import { exchangeCode, refreshTokens } from "@/lib/oauth/grants.ts";
import { readClient } from "@/lib/oauth/clients.ts";
import { json, notConfigured, oauthError } from "@/lib/oauth/http.ts";
import { parseScopes, readForm } from "@/lib/oauth/form.ts";

export const dynamic = "force-dynamic";

/**
 * Token endpoint. Claude gives this 10 seconds (30 for refresh), so nothing slow
 * happens here: no chain reads, no relayer calls - those belong to /oauth/approve.
 *
 * Errors follow RFC 6749 section 5.2. In particular `invalid_grant` is reserved
 * for a grant that is genuinely bad: a client that receives it throws the
 * connection away and sends the person back through consent. An infrastructure
 * failure is a 503 so the client retries instead.
 */
export async function POST(req: Request) {
  const off = notConfigured();
  if (off) return off;
  const form = await readForm(req);
  if (!form.ok) return oauthError("invalid_request", form.description);
  const p = form.params;

  const client = readClient(p.get("client_id"));
  if (!client) return oauthError("invalid_client", "Unknown client_id. Register again.", 400);

  try {
    switch (p.get("grant_type")) {
      case "authorization_code": {
        const code = p.get("code");
        const redirectUri = p.get("redirect_uri");
        const verifier = p.get("code_verifier");
        if (!code || !redirectUri || !verifier) return oauthError("invalid_request", "code, redirect_uri and code_verifier are required.");
        const result = await exchangeCode({
          code,
          clientId: p.get("client_id")!,
          redirectUri,
          verifier,
          resource: p.get("resource") ?? undefined,
        });
        return result.ok ? json(result.tokens) : oauthError(result.error, result.description, result.status);
      }

      case "refresh_token": {
        const refreshToken = p.get("refresh_token");
        if (!refreshToken) return oauthError("invalid_request", "refresh_token is required.");
        const scopes = parseScopes(p.get("scope"));
        if (!scopes.ok) return oauthError("invalid_scope", "Unknown scope requested.");
        const result = await refreshTokens({
          refreshToken,
          clientId: p.get("client_id")!,
          scopes: scopes.scopes.length ? scopes.scopes : undefined,
        });
        return result.ok ? json(result.tokens) : oauthError(result.error, result.description, result.status);
      }

      default:
        return oauthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
    }
  } catch (error) {
    console.error("[fuuud] token endpoint store unavailable:", error instanceof Error ? error.message : error);
    return oauthError("temporarily_unavailable", "Try again in a moment.", 503, { "retry-after": "5" });
  }
}
