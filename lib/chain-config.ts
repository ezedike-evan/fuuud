/**
 * One check of the whole chain configuration, so a mismatch is explained instead of
 * surfacing as "Object 0x8bf8... not found".
 *
 * The app has four settings that must all describe the SAME network: the relayer URL
 * (MEMWAL_SERVER_URL), the registry object (MEMWAL_REGISTRY_ID), the network the
 * browser signs on (NEXT_PUBLIC_SUI_NETWORK) and the Enoki key. Changing one and not
 * the others is the commonest way to break setup, and each wrong combination fails
 * somewhere different and cryptically. This looks at them together.
 *
 * No `server-only`, no `next/*`: it is unit-tested with injected dependencies.
 */
import { grpcFor, relayerChain, type RelayerChain } from "./account-lookup.ts";

export type ChainConfig = {
  network: "testnet" | "mainnet";
  grpcUrl: string;
  packageId: string;
  registryId: string;
  relayerUrl: string;
};

export type Inspection =
  | { ok: true; config: ChainConfig; verified: boolean }
  | { ok: false; problem: string };

/**
 * The registries MemWal publishes, keyed by the package id each relayer reports. Both
 * were checked onchain: each is an AccountRegistry of that network's package.
 */
export const KNOWN: Record<string, { network: "testnet" | "mainnet"; registryId: string; relayer: string }> = {
  "0x0a625e2db2af6f591a4c80a3d8551ddf11656089cc3a20c5e9e7f8fb75b9265c": {
    network: "testnet",
    registryId: "0x736aef9906798fca4460490ccdf8e8502ef170122dc26ecae32111b78c6b42dd",
    relayer: "https://relayer-staging.memory.walrus.xyz",
  },
  "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5": {
    network: "mainnet",
    registryId: "0x8bf82c9e09e36b8d1c38298f68b7cb68e7b8762887e7592add9986d5e9cf199f",
    relayer: "https://relayer.memory.walrus.xyz",
  },
};

const networkOfRegistry = (id: string) => Object.values(KNOWN).find((k) => k.registryId === id.toLowerCase())?.network;
const short = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`;
const OBJECT_ID = /^0x[0-9a-f]{64}$/i;

export type Deps = {
  chain: (server: string) => Promise<RelayerChain>;
  /** The object's type, or null when it does not exist. Throws when Sui cannot be reached. */
  registry: (chain: RelayerChain, id: string) => Promise<{ type: string } | null>;
};

const realDeps: Deps = {
  chain: relayerChain,
  async registry(chain, id) {
    try {
      const { object } = await grpcFor(chain).getObject({ objectId: id });
      return { type: String((object as { type?: string }).type ?? "") };
    } catch (error) {
      if (/not.?found|does not exist|no such/i.test(error instanceof Error ? error.message : String(error))) return null;
      throw error;
    }
  },
};

export async function inspectChainConfig(
  env: { server?: string; registryId?: string; appNetwork?: string; packageOverride?: string } = {},
  deps: Deps = realDeps,
): Promise<Inspection> {
  const server = (env.server ?? process.env.MEMWAL_SERVER_URL)?.trim() || "https://relayer-staging.memory.walrus.xyz";
  const registryId = (env.registryId ?? process.env.MEMWAL_REGISTRY_ID)?.trim() ?? "";
  const appNetwork = (env.appNetwork ?? process.env.NEXT_PUBLIC_SUI_NETWORK)?.trim() || "testnet";

  let chain: RelayerChain;
  try {
    // One retry: a single dropped request must not show the operator a "misconfigured" banner.
    chain = await deps.chain(server).catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return deps.chain(server);
    });
  } catch (error) {
    return { ok: false, problem: `Could not read the relayer at ${server} (${error instanceof Error ? error.message : error}). Check MEMWAL_SERVER_URL.` };
  }

  const known = KNOWN[chain.packageId.toLowerCase()];
  const suggestion = known ? ` The ${chain.network} registry is ${known.registryId}.` : "";

  if (appNetwork !== chain.network) {
    const relayerFor = (n: string) => Object.values(KNOWN).find((k) => k.network === n)?.relayer;
    return {
      ok: false,
      problem:
        `This app is set to ${appNetwork} (NEXT_PUBLIC_SUI_NETWORK) but its relayer ${server} is on ${chain.network}. ` +
        `Make them the same: either set NEXT_PUBLIC_SUI_NETWORK=${chain.network}, or point MEMWAL_SERVER_URL at ${relayerFor(appNetwork) ?? `a ${appNetwork} relayer`}. ` +
        `NEXT_PUBLIC_* values are baked in at build time, so redeploy after changing it.`,
    };
  }

  if (!registryId) {
    return { ok: false, problem: `MEMWAL_REGISTRY_ID is not set.${suggestion}` };
  }
  if (!OBJECT_ID.test(registryId)) {
    return { ok: false, problem: `MEMWAL_REGISTRY_ID is not a valid object id (it should be 0x followed by 64 hex characters).${suggestion}` };
  }

  let found: { type: string } | null;
  try {
    found = await deps.registry(chain, registryId);
  } catch {
    // Sui being unreachable is not a misconfiguration. Do not block setup on it.
    return { ok: true, verified: false, config: toConfig(chain, registryId, server, env.packageOverride) };
  }

  if (!found) {
    const belongsTo = networkOfRegistry(registryId);
    return {
      ok: false,
      problem:
        `MEMWAL_REGISTRY_ID ${short(registryId)} does not exist on ${chain.network}.` +
        (belongsTo && belongsTo !== chain.network
          ? ` That is the ${belongsTo} registry, but the relayer is on ${chain.network}. Either use the ${chain.network} registry${known ? ` (${known.registryId})` : ""}, or switch MEMWAL_SERVER_URL and NEXT_PUBLIC_SUI_NETWORK to ${belongsTo}.`
          : suggestion || " Check that you copied it from the right network."),
    };
  }
  if (!/::account::AccountRegistry$/.test(found.type)) {
    return { ok: false, problem: `MEMWAL_REGISTRY_ID ${short(registryId)} exists on ${chain.network} but is not a MemWal account registry (it is a ${found.type || "different kind of object"}).${suggestion}` };
  }

  return { ok: true, verified: true, config: toConfig(chain, registryId, server, env.packageOverride) };
}

function toConfig(chain: RelayerChain, registryId: string, server: string, packageOverride?: string): ChainConfig {
  return {
    network: chain.network,
    grpcUrl: chain.grpcUrl,
    packageId: (packageOverride ?? process.env.MEMWAL_PACKAGE_ID)?.trim() || chain.packageId,
    registryId,
    relayerUrl: server,
  };
}

/** A good answer is cached briefly; a failure is not, so a fix shows up on the next load. */
let cached: { at: number; value: Inspection } | null = null;
export async function inspectCached(): Promise<Inspection> {
  if (cached && cached.value.ok && Date.now() - cached.at < 60_000) return cached.value;
  const value = await inspectChainConfig();
  cached = { at: Date.now(), value };
  return value;
}
