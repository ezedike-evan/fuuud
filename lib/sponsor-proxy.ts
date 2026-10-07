import "server-only";
import { getOwnerAddress } from "./session.ts";
import { kvIncr } from "./kv.ts";

/**
 * Forwards sponsor calls to the relayer, from OUR origin.
 *
 * The relayer's CORS does not allow arbitrary origins, so a browser on this app
 * cannot call /sponsor directly. Nothing secret passes through: the relayer
 * authenticates each request by a wallet signature over the exact transaction
 * (`authSignature`), and Enoki holds the sponsorship budget on its side.
 *
 * Requires a signed-in session and a `sender` equal to it, so this is not an
 * open relay for strangers to spend the relayer's sponsorship through our
 * domain.
 */
export async function proxySponsor(req: Request, path: "/sponsor" | "/sponsor/execute"): Promise<Response> {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });

  // Sponsored gas is a shared budget. A person legitimately makes a handful of calls
  // (account, delegate, a few connectors); this stops a script from draining it.
  try {
    if ((await kvIncr(`sponsor:${address}`, 3600)) > 60) return new Response("Too many sponsored transactions. Try again later.", { status: 429 });
  } catch (error) {
    console.error("[fuuud] sponsor rate limit unavailable:", error instanceof Error ? error.message : error);
  }

  const body = (await req.json().catch(() => null)) as { sender?: unknown } | null;
  if (!body || typeof body.sender !== "string" || body.sender.toLowerCase() !== address) {
    return new Response("sender must be the signed-in address", { status: 403 });
  }

  const server = (process.env.MEMWAL_SERVER_URL?.trim() || "https://relayer-staging.memory.walrus.xyz").replace(/\/$/, "");
  const upstream = await fetch(`${server}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
