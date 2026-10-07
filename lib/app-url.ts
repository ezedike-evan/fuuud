/**
 * The ONE place the public origin is decided.
 *
 * OAuth metadata, the `resource` an access token is bound to, and every redirect
 * must agree on this string byte for byte: Claude compares the protected-resource
 * `resource` to the URL the person typed, and a mismatch fails as "Couldn't reach
 * the MCP server". So it is configured, never derived from the request's Host
 * header (which a proxy or preview URL can change).
 *
 * `APP_URL` is read at runtime. `NEXT_PUBLIC_APP_URL` is inlined into the client
 * bundle at BUILD time, so changing it needs a rebuild; it is only a fallback.
 */

const isProd = () => process.env.NODE_ENV === "production";

/** The canonical origin: lowercase scheme and host, no default port, no path, no trailing slash. */
export function appUrl(): string {
  const raw = (process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "");
  if (!raw) {
    if (isProd()) throw new Error("APP_URL is required in production (the public https origin, e.g. https://fuuud.example).");
    return "http://localhost:3002";
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`APP_URL is not a valid URL: ${raw}`);
  }
  if (isProd() && url.protocol !== "https:") throw new Error("APP_URL must be https in production.");
  return url.origin;
}

export const issuer = () => appUrl();
export const mcpUrl = () => `${appUrl()}/api/mcp`;

/**
 * RFC 8707 canonical form of a `resource` indicator: lowercase scheme and host,
 * default port dropped, no fragment, no trailing slash. Returns null for
 * anything that is not an absolute http(s) URL or that carries a query.
 */
export function canonicalResource(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.search) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/** Does a client-supplied `resource` name this server's MCP endpoint? */
export function isOurResource(input: string): boolean {
  const given = canonicalResource(input);
  return given !== null && given === canonicalResource(mcpUrl());
}
