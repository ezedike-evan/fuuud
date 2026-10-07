import { fetchAccountIdForOwner, fetchDelegateKeys, grpcFor } from "@/lib/account-lookup.ts";
import { inspectCached } from "@/lib/chain-config.ts";
import { MAX_DELEGATE_KEYS, classifyKey } from "@/lib/delegate-keys.ts";
import { credsFor } from "@/lib/memwal-cookie.ts";
import { listGrants } from "@/lib/oauth/grants.ts";
import { oauthConfigured } from "@/lib/seal.ts";
import { getOwnerAddress } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

/**
 * The keys registered on the signed-in person's own account, each marked so the right
 * ones can be removed safely: THIS browser's key, a connected app's key (disconnect it
 * under Connected apps instead), an agent key, or something else (an old device).
 *
 * Only the person's own account is ever read: the owner comes from the session and the
 * account is looked up onchain by that owner, never from a request parameter.
 */
export async function GET() {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });

  const checked = await inspectCached();
  if (!checked.ok) return new Response(checked.problem, { status: 503 });

  try {
    const client = grpcFor(checked.config);
    const accountId = await fetchAccountIdForOwner(client, checked.config.registryId, address);
    if (!accountId) return Response.json({ accountId: null, max: MAX_DELEGATE_KEYS, keys: [] }, { headers: { "cache-control": "no-store" } });

    const [keys, mine, grants] = await Promise.all([
      fetchDelegateKeys(client, accountId),
      credsFor(address),
      oauthConfigured() ? listGrants(address).catch(() => []) : Promise.resolve([]),
    ]);
    const connectorKeys = new Set(grants.map((g) => g.publicKey.toLowerCase()));

    return Response.json(
      {
        accountId,
        max: MAX_DELEGATE_KEYS,
        keys: keys
          .map((k) => ({ ...k, kind: classifyKey(k, { thisBrowser: mine?.delegatePublicKey, connectorKeys }) }))
          .sort((a, b) => b.createdAt - a.createdAt),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[fuuud] could not list delegate keys:", error instanceof Error ? error.message : error);
    return new Response("Could not read your account's keys from Sui. Try again.", { status: 502 });
  }
}
