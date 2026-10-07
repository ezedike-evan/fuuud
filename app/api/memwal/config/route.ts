import { inspectCached } from "@/lib/chain-config.ts";

export const dynamic = "force-dynamic";

/**
 * Package id comes from the relayer, not from docs or our own env (the hosted relayers
 * do not use the ids the docs list). The registry id is not served by /config, so it is
 * the one configured value, and it is checked against the relayer's own network here
 * instead of failing later as "Object ... not found".
 *
 * A configuration problem is a 503 with a sentence the operator can act on.
 */
export async function GET() {
  const result = await inspectCached();
  if (!result.ok) return new Response(result.problem, { status: 503, headers: { "cache-control": "no-store" } });
  const { config } = result;
  return Response.json(
    { packageId: config.packageId, registryId: config.registryId, network: config.network, relayerUrl: config.relayerUrl, grpcUrl: config.grpcUrl },
    { headers: { "cache-control": "no-store" } },
  );
}
