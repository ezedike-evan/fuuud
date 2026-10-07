/**
 * Which redirect URIs a client may register and use.
 *
 * This list is the whole defence against a stranger registering a client that
 * sends someone's authorization code to their own server, so it is a curated
 * allow-list, not "any https URL". Extend it with OAUTH_REDIRECT_ALLOW rather
 * than editing code when a new AI app turns up.
 *
 * Everything is parsed with `new URL` and compared on parsed parts, never with
 * string prefixes: `https://claude.ai.evil.com` and `http://localhost.evil.com`
 * both start with an allowed-looking string.
 */

/** Exact redirect URIs of hosted clients. */
const BUILT_IN_EXACT = [
  "https://claude.ai/api/mcp/auth_callback", // Claude web, desktop, mobile, Cowork
  "https://chatgpt.com/connector_platform_oauth_redirect", // ChatGPT, with issuer identification
  "https://vscode.dev/redirect", // VS Code for the web (verify against current VS Code docs)
  "https://insiders.vscode.dev/redirect",
  "cursor://anysphere.cursor-mcp/oauth/callback", // Cursor's private scheme
];

/** ChatGPT's per-connection form, used when issuer identification is not negotiated. */
const CHATGPT_CALLBACK_PATH = /^\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const loopbackAllowed = () => process.env.OAUTH_ALLOW_LOOPBACK?.trim() !== "0";

function parse(uri: string): URL | null {
  if (typeof uri !== "string" || uri.length > 2048) return null;
  try {
    const url = new URL(uri);
    // Never accept credentials or a fragment in a redirect URI.
    if (url.username || url.password || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

const isLoopback = (url: URL) => url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);

function extraExact(): string[] {
  return (process.env.OAUTH_REDIRECT_ALLOW ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parse(s)?.href)
    .filter((s): s is string => Boolean(s));
}

export function isAllowedRedirect(uri: string): boolean {
  const url = parse(uri);
  if (!url) return false;

  if (isLoopback(url)) return loopbackAllowed();

  if (url.protocol === "https:" && url.hostname === "chatgpt.com" && !url.port && CHATGPT_CALLBACK_PATH.test(url.pathname) && !url.search) {
    return true;
  }

  const builtIn = BUILT_IN_EXACT.map((u) => parse(u)?.href);
  return [...builtIn, ...extraExact()].includes(url.href);
}

/** Registration keeps the allowed URIs and drops the rest (Cursor registers several at once). */
export const filterAllowed = (uris: readonly unknown[]): string[] =>
  uris.filter((u): u is string => typeof u === "string" && isAllowedRedirect(u));

/**
 * Does `requested` match one of the URIs the client registered?
 * Loopback redirects ignore the port (RFC 8252 section 7.3: CLIs and IDEs bind a
 * random one per run); everything else must match exactly.
 */
export function redirectMatches(registered: readonly string[], requested: string): boolean {
  const want = parse(requested);
  if (!want || !isAllowedRedirect(requested)) return false;

  if (isLoopback(want)) {
    return registered.some((r) => {
      const have = parse(r);
      return Boolean(have && isLoopback(have) && have.hostname === want.hostname && have.pathname === want.pathname && have.search === want.search);
    });
  }
  return registered.some((r) => parse(r)?.href === want.href);
}

/** What the consent screen shows so the person can see where the grant will go. */
export function redirectLabel(uri: string): string {
  const url = parse(uri);
  if (!url) return "an unrecognised address";
  if (isLoopback(url)) return "an app running on your own computer (localhost)";
  if (url.protocol === "https:") return url.hostname;
  return `the ${url.protocol.replace(":", "")} app on this device`;
}

/**
 * Browser origins allowed to call the MCP endpoint. The MCP spec requires servers
 * to validate `Origin` (DNS-rebinding defence). Native and server-side clients
 * (Claude, ChatGPT backends) send no Origin at all; this only matters for
 * browser-based clients such as the MCP Inspector or claude.ai itself.
 */
export function isAllowedOrigin(origin: string, ownOrigin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false; // an Origin is scheme://host[:port] only
  if (origin === ownOrigin) return true;
  if (isLoopback(url)) return loopbackAllowed();
  const hosted = [...BUILT_IN_EXACT, ...extraExact()].map((u) => parse(u)).filter((u): u is URL => Boolean(u) && u!.protocol === "https:");
  return hosted.some((u) => u.origin === origin);
}
