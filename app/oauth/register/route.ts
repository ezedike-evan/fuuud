import { kvIncr } from "@/lib/kv.ts";
import { registerClient } from "@/lib/oauth/clients.ts";
import { clientIp, json, notConfigured, oauthError } from "@/lib/oauth/http.ts";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;
const REGISTRATIONS_PER_IP_PER_HOUR = 30;

/**
 * Dynamic Client Registration (RFC 7591). Anyone can call this, so it is cheap,
 * bounded and stateless: a capped body, a per-IP rate limit, only allow-listed
 * redirect URIs, and nothing stored. Nothing the client sends is ever fetched.
 */
export async function POST(req: Request) {
  const off = notConfigured();
  if (off) return off;
  const ip = clientIp(req);
  try {
    if ((await kvIncr(`oauth:reg:${ip}`, 3600)) > REGISTRATIONS_PER_IP_PER_HOUR) {
      return oauthError("invalid_client_metadata", "Too many registrations. Try again later.", 429, { "retry-after": "3600" });
    }
  } catch (error) {
    // A rate-limit store outage must not take registration down with it.
    console.error("[fuuud] registration rate limit unavailable:", error instanceof Error ? error.message : error);
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return oauthError("invalid_client_metadata", "Request body is too large.", 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return oauthError("invalid_client_metadata", "Request body must be JSON.");
  }

  const result = registerClient(body);
  if (!result.ok) return oauthError(result.error, result.description);
  return json(result.response, 201);
}
