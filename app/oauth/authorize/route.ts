import { appUrl, canonicalResource, isOurResource, mcpUrl } from "@/lib/app-url.ts";
import { readClient } from "@/lib/oauth/clients.ts";
import { parseScopes } from "@/lib/oauth/form.ts";
import { isValidChallenge } from "@/lib/oauth/pkce.ts";
import { setPending } from "@/lib/oauth/pending.ts";
import { redirectMatches } from "@/lib/oauth/redirect.ts";
import type { OAuthScope } from "@/lib/oauth/grants.ts";
import { NO_STORE } from "@/lib/oauth/http.ts";
import { oauthConfigured } from "@/lib/seal.ts";

export const dynamic = "force-dynamic";

const DEFAULT_SCOPES: OAuthScope[] = ["memory:read", "memory:write", "offline_access"];

const go = (location: string) => new Response(null, { status: 302, headers: { location, ...NO_STORE } });

/**
 * Where an authorization request begins.
 *
 * Validate FIRST, in this order, because the order decides who an error may be
 * sent to:
 *   1. client_id and redirect_uri. If either is wrong we cannot know where it is
 *      safe to send the person, so we show OUR error page and never redirect to
 *      the supplied URI (that would be an open redirect).
 *   2. only then, errors go back to the now-validated redirect URI with `state`
 *      and `iss`.
 * A valid request is parked in a sealed cookie and the person is sent on to the
 * consent page, which handles sign-in and account setup first.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const error = (reason: string) => go(`${appUrl()}/oauth/error?reason=${reason}`);
  if (!oauthConfigured()) return error("not_configured");

  // A parameter that appears twice is ambiguous; refuse rather than guess which one wins.
  const keys = [...q.keys()];
  if (new Set(keys).size !== keys.length) return error("invalid_request");

  const client = readClient(q.get("client_id"));
  if (!client) return error("unknown_client");

  const requested = q.get("redirect_uri");
  const redirectUri = requested ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) return error("bad_redirect");

  const state = q.get("state") ?? undefined;
  if (state !== undefined && state.length > 512) return error("invalid_request");

  const back = (code: string, description: string) => {
    const target = new URL(redirectUri);
    target.searchParams.set("error", code);
    target.searchParams.set("error_description", description);
    if (state !== undefined) target.searchParams.set("state", state);
    target.searchParams.set("iss", appUrl());
    return go(target.href);
  };

  if (q.get("response_type") !== "code") return back("unsupported_response_type", "Only response_type=code is supported.");

  const challenge = q.get("code_challenge");
  if (!challenge || !isValidChallenge(challenge) || q.get("code_challenge_method") !== "S256") {
    return back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }

  const resource = q.get("resource");
  if (resource !== null && !isOurResource(resource)) return back("invalid_target", "resource does not identify this server.");

  const parsed = parseScopes(q.get("scope"));
  if (!parsed.ok) return back("invalid_scope", "Unknown scope requested.");
  // No scope asked for: offer the full set and let the person untick. Reading is
  // always part of it - a connection that can do nothing is not a connection.
  const scopes: OAuthScope[] = parsed.scopes.length ? parsed.scopes : DEFAULT_SCOPES;
  if (!scopes.includes("memory:read")) scopes.unshift("memory:read");

  await setPending({ clientId: q.get("client_id")!, redirectUri, state, challenge, scopes, resource: canonicalResource(mcpUrl())! });
  return go(`${appUrl()}/oauth/consent`);
}
