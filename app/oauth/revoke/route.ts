import { revokeByToken } from "@/lib/oauth/grants.ts";
import { json, notConfigured, oauthError } from "@/lib/oauth/http.ts";
import { readForm } from "@/lib/oauth/form.ts";

export const dynamic = "force-dynamic";

/**
 * RFC 7009. Always answers 200 for a well-formed request, whether or not the
 * token was valid: the caller must not be able to probe which tokens exist.
 */
export async function POST(req: Request) {
  const off = notConfigured();
  if (off) return off;
  const form = await readForm(req);
  if (!form.ok) return oauthError("invalid_request", form.description);
  const token = form.params.get("token");
  if (!token) return oauthError("invalid_request", "token is required.");

  try {
    await revokeByToken(token);
  } catch (error) {
    console.error("[fuuud] revoke store unavailable:", error instanceof Error ? error.message : error);
    return oauthError("temporarily_unavailable", "Try again in a moment.", 503, { "retry-after": "5" });
  }
  return json({});
}
