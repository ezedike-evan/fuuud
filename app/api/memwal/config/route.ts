/**
 * Package id comes from the relayer, not from docs or our own env: the hosted
 * relayers do not use the ids the documentation lists, and a stale id fails as
 * an opaque Move abort in the person's wallet. The registry id is not served by
 * /config, so it is the one value that has to be configured.
 */
export async function GET() {
  const server = process.env.MEMWAL_SERVER_URL?.trim() || "https://relayer-staging.memory.walrus.xyz";
  const registryId = process.env.MEMWAL_REGISTRY_ID?.trim();
  if (!registryId) return new Response("MEMWAL_REGISTRY_ID is not set on the server.", { status: 503 });

  try {
    const res = await fetch(`${server}/config`, { cache: "no-store" });
    if (!res.ok) throw new Error(`relayer /config answered ${res.status}`);
    const cfg = (await res.json()) as { packageId?: string; network?: string; suiGrpcUrl?: string };
    if (!cfg.packageId) throw new Error("relayer /config returned no packageId");
    return Response.json({
      packageId: process.env.MEMWAL_PACKAGE_ID?.trim() || cfg.packageId,
      registryId,
      network: cfg.network ?? "testnet",
      relayerUrl: server,
      grpcUrl: cfg.suiGrpcUrl ?? null,
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not read relayer config", { status: 502 });
  }
}
