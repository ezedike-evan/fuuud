"use client";

import type { EnokiWallet } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { addDelegateKey, generateDelegateKey } from "@mysten-incubation/memwal/account";
import { enokiSigner } from "./enoki-signer";
import { NETWORK } from "./use-enoki-wallet";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/**
 * Make a NEW delegate key and register it on the signed-in person's own account with
 * their wallet (gas is sponsored). Used for surfaces that act without a browser, such as
 * the Telegram chat. The private key is returned once, to be sent to the server over the
 * person's own authenticated request and never kept in the page.
 */
export async function mintDelegate(opts: {
  wallet: EnokiWallet;
  address: string;
  label: string;
  onStep?: (step: string) => void;
}): Promise<{ publicKey: string; privateKey: string }> {
  const { wallet, address, label, onStep = () => {} } = opts;

  onStep("Checking your account…");
  const found = await fetch("/api/memwal/account");
  if (!found.ok) throw new Error(await found.text());
  const accountId = ((await found.json()) as { accountId: string | null }).accountId;
  if (!accountId) throw new Error("Create your memory account first.");

  const cfgRes = await fetch("/api/memwal/config");
  if (!cfgRes.ok) throw new Error(await cfgRes.text());
  const cfg = await cfgRes.json();
  if (cfg.network !== NETWORK) throw new Error(`This app is built for ${NETWORK} but its relayer is on ${cfg.network}.`);

  onStep("Connecting your wallet…");
  const { accounts } = await wallet.features["standard:connect"].connect();
  const account = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
  if (!account) throw new Error("Your wallet is on a different address than this session. Sign out and back in.");

  const suiClient = new SuiGrpcClient({ network: NETWORK, baseUrl: cfg.grpcUrl ?? `https://fullnode.${NETWORK}.sui.io:443` });
  const delegate = await generateDelegateKey();

  onStep("Registering a key for Telegram onchain…");
  await addDelegateKey({
    packageId: cfg.packageId,
    registryId: cfg.registryId,
    accountId,
    publicKey: delegate.publicKey,
    label,
    walletSigner: enokiSigner(wallet, account, `sui:${NETWORK}`, suiClient),
    suiNetwork: NETWORK,
    suiClient,
  });

  return { publicKey: hex(delegate.publicKey), privateKey: delegate.privateKey };
}
