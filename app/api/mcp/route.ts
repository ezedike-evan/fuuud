import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { appUrl, canonicalResource, mcpUrl } from "@/lib/app-url.ts";
import { kvIncr } from "@/lib/kv.ts";
import { runInScope } from "@/lib/memwal-scope.ts";
import { ALL_SCOPES, SERVER_CAPABILITIES, SERVER_INFO, registerTools, type Scope } from "@/lib/mcp-tools.ts";
import { verifyAccess } from "@/lib/oauth/grants.ts";
import { devMockEnabled, isDevMockCreds } from "@/lib/oauth/dev.ts";
import { NO_STORE, json, notConfigured, protectedResourceMetadataUrl, unauthorized } from "@/lib/oauth/http.ts";
import { isAllowedOrigin } from "@/lib/oauth/redirect.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A hosted write waits this long, then answers "accepted, still saving" rather than outliving the client's own timeout. */
const WRITE_WAIT_MS = 25_000;
/** A call that must wait longer than this for the relayer's allowance answers "rate limited" instead of hanging. */
const RATE_WAIT_MS = 15_000;
const CALLS_PER_MINUTE = 120;

const TOOL_SCOPES: readonly Scope[] = ALL_SCOPES;

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin, appUrl())) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-expose-headers": "WWW-Authenticate, Mcp-Session-Id",
    vary: "Origin",
  };
}

function withHeaders(res: Response, extra: Record<string, string>): Response {
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  if (origin && !Object.keys(cors).length) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
      "access-control-max-age": "600",
    },
  });
}

/**
 * The hosted MCP endpoint (Streamable HTTP, stateless).
 *
 * ORDER MATTERS, and each step is a requirement of a real client:
 *   1. Origin check (DNS-rebinding defence). Server-side clients send no Origin.
 *   2. Authenticate BEFORE anything else, for every method. A request with no
 *      valid token must be a 401 carrying the metadata pointer, whatever its
 *      method, or Claude never learns where to sign in.
 *   3. Only then 405 for GET/DELETE (this server has no standalone stream).
 *   4. A KV outage is a 503, never a 401: a 401 makes the client discard a good
 *      connection and send the person back through consent.
 *
 * Everything below runs under the token's OWN credentials via runInScope, and a
 * fresh server and transport are built per request, so nothing one person does
 * can be seen by the next request. The owner comes from the verified grant and is
 * never read from tool arguments.
 */
async function handle(req: Request): Promise<Response> {
  const off = notConfigured();
  if (off) return off;
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  if (origin && !Object.keys(cors).length) {
    return new Response(JSON.stringify({ error: "forbidden_origin" }), { status: 403, headers: { "content-type": "application/json", ...NO_STORE } });
  }

  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return withHeaders(unauthorized(protectedResourceMetadataUrl(), header.length > 0), cors);

  let verified;
  try {
    verified = await verifyAccess(match[1]);
  } catch (error) {
    console.error("[fuuud] mcp auth store unavailable:", error instanceof Error ? error.message : error);
    return withHeaders(json({ error: "temporarily_unavailable" }, 503, { "retry-after": "5" }), cors);
  }
  if (!verified.ok) return withHeaders(unauthorized(protectedResourceMetadataUrl(), true, verified.reason), cors);

  const { grant, creds, scopes } = verified;

  // A grant is bound to the URL it was issued for. If the domain changed, it is not valid here.
  if (canonicalResource(grant.resource) !== canonicalResource(mcpUrl())) {
    return withHeaders(unauthorized(protectedResourceMetadataUrl(), true, "audience mismatch"), cors);
  }
  // A placeholder dev grant must never be honoured outside local development.
  const mock = isDevMockCreds(creds);
  if (mock && !devMockEnabled()) return withHeaders(unauthorized(protectedResourceMetadataUrl(), true, "invalid"), cors);

  if (req.method !== "POST") {
    return withHeaders(new Response(null, { status: 405, headers: { allow: "POST, OPTIONS", ...NO_STORE } }), cors);
  }

  try {
    const minute = Math.floor(Date.now() / 60_000);
    if ((await kvIncr(`oauth:rl:${grant.id}:${minute}`, 120)) > CALLS_PER_MINUTE) {
      return withHeaders(json({ error: "rate_limited" }, 429, { "retry-after": "30" }), cors);
    }
  } catch (error) {
    // Failing open on the limiter is deliberate: it protects the relayer, not the data.
    console.error("[fuuud] mcp rate limit unavailable:", error instanceof Error ? error.message : error);
  }

  const toolScopes = TOOL_SCOPES.filter((s) => scopes.includes(s));
  const server = new McpServer(SERVER_INFO, { capabilities: SERVER_CAPABILITIES });
  registerTools(server, { owner: creds.owner, scopes: toolScopes, strict: true, writeWaitMs: WRITE_WAIT_MS });

  // Stateless: no session id, plain JSON responses, one transport for exactly one request.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });

  try {
    await server.connect(transport);
    const res = await runInScope({ creds: mock ? null : creds, maxWaitMs: RATE_WAIT_MS }, () =>
      transport.handleRequest(req, {
        authInfo: {
          token: "redacted",
          clientId: grant.clientId,
          scopes,
          expiresAt: undefined,
          extra: { gid: grant.id },
        },
      }),
    );
    return withHeaders(res, { ...cors, ...NO_STORE });
  } catch (error) {
    console.error("[fuuud] mcp request failed:", error instanceof Error ? error.message : error);
    return withHeaders(json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }, 500), cors);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
