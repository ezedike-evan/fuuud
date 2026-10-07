"use client";

import type { EnokiWallet } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { removeDelegateKey } from "@mysten-incubation/memwal/account";
import { enokiSigner } from "./enoki-signer";
import { NETWORK } from "./use-enoki-wallet";

/**
 * Remove one delegate key from the person's account with their own wallet (gas sponsored).
 * Forward-only, like every removal: the relayer may keep accepting the key for ~25 s, and
 * anything it already decrypted stays decrypted.
 */
export async function removeKeyOnchain(input: { wallet: EnokiWallet; address: string; accountId: string; publicKey: string }): Promise<void> {
  const cfgRes = await fetch("/api/memwal/config");
  if (!cfgRes.ok) throw new Error(await cfgRes.text());
  const cfg = await cfgRes.json();
  if (cfg.network !== NETWORK) throw new Error(`This app is built for ${NETWORK} but its relayer is on ${cfg.network}.`);

  const { accounts } = await input.wallet.features["standard:connect"].connect();
  const account = accounts.find((a) => a.address.toLowerCase() === input.address.toLowerCase());
  if (!account) throw new Error("Your wallet is on a different address than this session. Sign out and back in.");

  const suiClient = new SuiGrpcClient({ network: NETWORK, baseUrl: cfg.grpcUrl ?? `https://fullnode.${NETWORK}.sui.io:443` });
  await removeDelegateKey({
    packageId: cfg.packageId,
    registryId: cfg.registryId,
    accountId: input.accountId,
    publicKey: input.publicKey,
    walletSigner: enokiSigner(input.wallet, account, `sui:${NETWORK}`, suiClient),
    suiNetwork: NETWORK,
    suiClient,
  });
}
