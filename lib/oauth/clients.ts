import { seal, open } from "../seal.ts";
import { filterAllowed } from "./redirect.ts";

/**
 * Dynamic Client Registration (RFC 7591), stateless.
 *
 * Nothing is stored: the `client_id` IS the registration, sealed under
 * OAUTH_SECRET. That avoids the "very large numbers of registered clients" DCR
 * produces (Claude registers on every fresh connection) and means there is no
 * table to fill up. It never expires; to invalidate every client, bump VERSION.
 *
 * Only public clients (`token_endpoint_auth_method: none`) exist here, and a
 * client's redirect URIs are limited to the allow-list in ./redirect.
 */

const PURPOSE = "oauth-client-id";
const VERSION = 1;
const NAME_MAX = 100;
const MAX_INPUT_URIS = 10;
const MAX_CLIENT_ID_LENGTH = 1500;

export type RegisteredClient = { name: string; redirectUris: string[] };

/**
 * The client name is shown on the consent screen and chosen by whoever
 * registered, so it is untrusted text: drop control, zero-width and bidi
 * characters (they can reorder what the person reads) and cap the length.
 */
export function sanitizeName(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  const cleaned = text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return cleaned || "Unnamed app";
}

export type Registration =
  | { ok: true; clientId: string; response: Record<string, unknown> }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string };

const GRANT_TYPES = ["authorization_code", "refresh_token"];

export function registerClient(body: unknown): Registration {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_client_metadata", description: "Request body must be a JSON object." };
  }
  const meta = body as Record<string, unknown>;

  if (meta.token_endpoint_auth_method !== undefined && meta.token_endpoint_auth_method !== "none") {
    return { ok: false, error: "invalid_client_metadata", description: "Only public clients are supported (token_endpoint_auth_method must be none)." };
  }
  if (meta.grant_types !== undefined) {
    const ok = Array.isArray(meta.grant_types) && meta.grant_types.every((g) => typeof g === "string" && GRANT_TYPES.includes(g));
    if (!ok) return { ok: false, error: "invalid_client_metadata", description: `grant_types must be a subset of ${GRANT_TYPES.join(", ")}.` };
  }
  if (meta.response_types !== undefined) {
    const ok = Array.isArray(meta.response_types) && meta.response_types.every((t) => t === "code");
    if (!ok) return { ok: false, error: "invalid_client_metadata", description: "response_types must be [\"code\"]." };
  }
  if (!Array.isArray(meta.redirect_uris) || meta.redirect_uris.length === 0 || meta.redirect_uris.length > MAX_INPUT_URIS) {
    return { ok: false, error: "invalid_redirect_uri", description: `redirect_uris must be a list of 1 to ${MAX_INPUT_URIS} URIs.` };
  }

  // Keep what is allowed, drop the rest. Cursor registers several URIs at once;
  // refusing the whole registration because one is unknown would break it.
  const accepted = filterAllowed(meta.redirect_uris).slice(0, 5);
  if (accepted.length === 0) {
    return {
      ok: false,
      error: "invalid_redirect_uri",
      description: "None of the redirect URIs belong to a supported client. The operator can allow more with OAUTH_REDIRECT_ALLOW.",
    };
  }

  const name = sanitizeName(meta.client_name);
  const clientId = seal(PURPOSE, { v: VERSION, n: name, r: accepted });
  if (clientId.length > MAX_CLIENT_ID_LENGTH) {
    return { ok: false, error: "invalid_client_metadata", description: "Client metadata is too large." };
  }

  return {
    ok: true,
    clientId,
    response: {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: accepted,
      token_endpoint_auth_method: "none",
      grant_types: GRANT_TYPES,
      response_types: ["code"],
    },
  };
}

/** The registration behind a client_id, or null if it is not one of ours. */
export function readClient(clientId: unknown): RegisteredClient | null {
  if (typeof clientId !== "string" || clientId.length > MAX_CLIENT_ID_LENGTH) return null;
  const data = open<{ v?: number; n?: string; r?: string[] }>(PURPOSE, clientId);
  if (!data || data.v !== VERSION || typeof data.n !== "string" || !Array.isArray(data.r)) return null;
  return { name: data.n, redirectUris: data.r };
}
