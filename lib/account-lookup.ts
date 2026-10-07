/**
 * Onchain reads for MemWal accounts, over gRPC. No `server-only` and no `next/*`
 * so the MCP server can use it too.
 *
 * Reads the object's `json` rather than decoding BCS by hand: a BCS schema must
 * list every field in declaration order, so a published package that grows a
 * field makes a hand-written schema decode silently wrong. `json` just gains
 * extra keys.
 */
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { fromHex, normalizeSuiAddress, toHex } from "@mysten/sui/utils";
import { parseDelegateKeys, type DelegateKey } from "./delegate-keys.ts";

export type RelayerChain = { network: "testnet" | "mainnet"; grpcUrl: string; packageId: string };

/** What network a relayer is on, from its own /config. The one source that cannot disagree with it. */
export async function relayerChain(serverUrl: string): Promise<RelayerChain> {
  const res = await fetch(`${serverUrl.replace(/\/$/, "")}/config`, { cache: "no-store" });
  if (!res.ok) throw new Error(`relayer /config answered ${res.status}`);
  const cfg = (await res.json()) as { network?: string; suiGrpcUrl?: string; packageId?: string };
  if ((cfg.network !== "testnet" && cfg.network !== "mainnet") || !cfg.suiGrpcUrl || !cfg.packageId) {
    throw new Error("relayer /config is missing network, suiGrpcUrl or packageId");
  }
  return { network: cfg.network, grpcUrl: cfg.suiGrpcUrl, packageId: cfg.packageId };
}

export const grpcFor = (chain: Pick<RelayerChain, "network" | "grpcUrl">) =>
  new SuiGrpcClient({ network: chain.network, baseUrl: chain.grpcUrl });

/** The MemWalAccount object id owned by `ownerAddress`, or null if they have none yet. */
export async function fetchAccountIdForOwner(
  client: SuiGrpcClient,
  registryId: string,
  ownerAddress: string,
): Promise<string | null> {
  const registry = await client.getObject({ objectId: registryId, include: { json: true } });

  // AccountRegistry.accounts is a sui::table::Table; its entries are dynamic
  // fields on the table's own UID. A UID renders as a string or as { id }.
  const accounts = registry.object.json?.accounts as { id?: string | { id?: string } } | undefined;
  const raw = accounts?.id;
  const tableId = typeof raw === "string" ? raw : raw?.id;
  if (!tableId) return null;

  try {
    const response = await client.getDynamicField({
      parentId: tableId,
      name: { type: "address", bcs: fromHex(normalizeSuiAddress(ownerAddress)) },
    });
    // The value is a Move `ID`: a bare 32-byte address.
    const value = response.dynamicField?.value?.bcs;
    return value?.length === 32 ? `0x${toHex(value)}` : null;
  } catch (error) {
    // "No such dynamic field" is the normal answer for an address with no account.
    if (/not.?found|does not exist|no such/i.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  }
}

/** Who owns a MemWalAccount. Lets the MCP server learn the owner address from the account id alone. */
export async function fetchOwnerOfAccount(client: SuiGrpcClient, accountId: string): Promise<string> {
  const account = await client.getObject({ objectId: accountId, include: { json: true } });
  const owner = (account.object.json as { owner?: string } | undefined)?.owner;
  if (!owner) throw new Error(`account ${accountId} has no readable owner field`);
  return normalizeSuiAddress(owner);
}

/** Every delegate key currently registered on an account, as the chain records them. */
export async function fetchDelegateKeys(client: SuiGrpcClient, accountId: string): Promise<DelegateKey[]> {
  const account = await client.getObject({ objectId: accountId, include: { json: true } });
  return parseDelegateKeys((account.object.json as { delegate_keys?: unknown } | undefined)?.delegate_keys);
}
