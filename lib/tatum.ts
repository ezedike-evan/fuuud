/**
 * Tatum's Sui gateway: the server's one road to Sui for reads.
 *
 * Every onchain read the server makes about a person's memory account — who owns it,
 * which delegate keys it holds, whether the registry is the right one — goes through
 * `grpcFor()` in ./account-lookup, and that goes through here when TATUM_API_KEY is set.
 *
 * Tatum serves Sui over NATIVE gRPC (HTTP/2, `application/grpc`), not gRPC-web. The
 * SDK's default transport is gRPC-web over fetch, which Tatum answers with
 * "unexpected response content type: application/grpc". So the server uses
 * protobuf-ts's grpc-js transport, which is the same RpcTransport interface the SDK's
 * SuiGrpcClient accepts: nothing downstream changes, it is still a SuiGrpcClient.
 *
 * Node only (grpc-js). The browser keeps talking to public fullnodes through the
 * wallet, and never sees the Tatum key.
 *
 * No `server-only`, no `next/*`: the MCP server imports this too.
 */
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { ChannelCredentials } from "@grpc/grpc-js";

export type SuiNetwork = "testnet" | "mainnet";

/** Tatum's gRPC hosts per network, as `host:port` for grpc-js. */
export const TATUM_GRPC_HOST: Record<SuiNetwork, string> = {
  mainnet: "sui-mainnet-grpc.gateway.tatum.io:443",
  testnet: "sui-testnet-grpc.gateway.tatum.io:443",
};

/** Tatum's JSON-RPC host. Mainnet only — Tatum lists testnet over gRPC alone. */
export const TATUM_JSON_RPC: Partial<Record<SuiNetwork, string>> = {
  mainnet: "https://sui-mainnet.gateway.tatum.io",
};

/** The header Tatum authenticates with, on both gRPC and JSON-RPC. */
export const TATUM_KEY_HEADER = "x-api-key";

export function tatumKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.TATUM_API_KEY?.trim();
  return key ? key : null;
}

/** Which road Sui reads take, for display and logs. Never the key itself. */
export function suiReadProvider(env: Record<string, string | undefined> = process.env): "tatum" | "fullnode" {
  return tatumKey(env) ? "tatum" : "fullnode";
}

/**
 * One transport per network per process. A grpc-js channel holds an HTTP/2 connection
 * open; making one per request would pay TLS on every read and leak sockets.
 */
const transports = new Map<string, GrpcTransport>();

function tatumTransport(network: SuiNetwork, key: string): GrpcTransport {
  const id = `${network}:${key.slice(0, 6)}`;
  let transport = transports.get(id);
  if (!transport) {
    transport = new GrpcTransport({
      host: TATUM_GRPC_HOST[network],
      channelCredentials: ChannelCredentials.createSsl(),
      meta: { [TATUM_KEY_HEADER]: key },
      // A hung read must not hold a chat turn or the setup page hostage.
      timeout: 15_000,
    });
    transports.set(id, transport);
  }
  return transport;
}

/**
 * A SuiGrpcClient for `network`: through Tatum when TATUM_API_KEY is set, otherwise
 * the fullnode URL the relayer itself reports (unchanged behaviour without a key).
 */
export function suiClientFor(network: SuiNetwork, fallbackGrpcUrl: string, env: Record<string, string | undefined> = process.env): SuiGrpcClient {
  const key = tatumKey(env);
  if (key) return new SuiGrpcClient({ network, transport: tatumTransport(network, key) });
  return new SuiGrpcClient({ network, baseUrl: fallbackGrpcUrl });
}

export type ChainHead = {
  provider: "tatum" | "fullnode";
  network: SuiNetwork;
  chainId: string | null;
  checkpoint: string | null;
  epoch: string | null;
  /** Server time the gateway reported for that checkpoint. */
  timestamp: string | null;
};

/**
 * The current head of the chain, read through the same road as every other read.
 * Shown in Settings next to the person's account, so "your memory account is onchain"
 * comes with the checkpoint it was read at.
 */
export async function chainHead(client: SuiGrpcClient, network: SuiNetwork, env: Record<string, string | undefined> = process.env): Promise<ChainHead> {
  const info = (await client.core.getChainIdentifier().catch(() => null)) as { chainIdentifier?: string } | null;
  const { response } = await client.ledgerService.getServiceInfo({});
  return {
    provider: suiReadProvider(env),
    network,
    chainId: response.chainId ?? info?.chainIdentifier ?? null,
    checkpoint: response.checkpointHeight != null ? String(response.checkpointHeight) : null,
    epoch: response.epoch != null ? String(response.epoch) : null,
    timestamp: response.timestamp ? new Date(Number(response.timestamp.seconds) * 1000).toISOString() : null,
  };
}
