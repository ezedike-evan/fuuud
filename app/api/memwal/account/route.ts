import { getOwnerAddress } from "@/lib/session.ts";
import { fetchAccountIdForOwner, grpcFor } from "@/lib/account-lookup.ts";
import { inspectCached } from "@/lib/chain-config.ts";

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
  const checked = await inspectCached();
  if (!checked.ok) return new Response(checked.problem, { status: 503 });
  const { config } = checked;

  try {
    return Response.json({ accountId: await fetchAccountIdForOwner(grpcFor(config), config.registryId, address) });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Account lookup failed", { status: 502 });
  }
}
