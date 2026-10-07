import { getOwnerAddress } from "@/lib/session.ts";
import { fetchAccountIdForOwner, grpcFor, relayerChain } from "@/lib/account-lookup.ts";

/**
 * The signed-in person's existing MemWalAccount, if any.
 *
 * Without this, clearing site data lost the only copy of the account id (it
 * rode in the sealed cookie), and /setup then failed with "already exists" and
 * asked the person to dig the id out of a block explorer. The chain knows it.
 */
export async function GET() {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  const registryId = process.env.MEMWAL_REGISTRY_ID?.trim();
  if (!registryId) return new Response("MEMWAL_REGISTRY_ID is not set on the server.", { status: 503 });

  try {
    const chain = await relayerChain(process.env.MEMWAL_SERVER_URL?.trim() || "https://relayer-staging.memory.walrus.xyz");
    return Response.json({ accountId: await fetchAccountIdForOwner(grpcFor(chain), registryId, address) });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Account lookup failed", { status: 502 });
  }
}
