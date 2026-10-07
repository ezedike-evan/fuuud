"use client";

import { useEffect, useState } from "react";
import { SuiClient, getFullnodeUrl } from "@mysten/sui-enoki/client";
import { registerEnokiWallets, type EnokiWallet } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { removeDelegateKey } from "@mysten-incubation/memwal/account";
import { enokiSigner } from "@/lib/enoki-signer";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "mainnet";

/** Your wallet removes this app's delegate key onchain. Then the server forgets its copy. */
export default function RevokeButton({ address }: { address: string }) {
  const [wallet, setWallet] = useState<EnokiWallet | null>(null);
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_ENOKI_API_KEY;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!apiKey || !clientId) return;
    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? window.location.origin;
    const { wallets, unregister } = registerEnokiWallets({
      apiKey,
      providers: { google: { clientId, redirectUrl: `${origin}/signin` } },
      client: new SuiClient({ url: getFullnodeUrl(NETWORK) }),
      network: NETWORK,
    });
    setWallet(wallets.google ?? null);
    return unregister;
  }, []);

  async function revoke() {
    if (!wallet) return;
    setState("working");
    setError(null);
    try {
      const held = await (await fetch("/api/memwal/revoke")).json();
      if (!held.registered) throw new Error("This browser holds no delegate key for your account.");
      const cfg = await (await fetch("/api/memwal/config")).json();

      const { accounts } = await wallet.features["standard:connect"].connect();
      const account = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
      if (!account) throw new Error("Your wallet is on a different address than this session.");

      if (cfg.network !== NETWORK) {
        throw new Error(`This app is built for ${NETWORK} but its relayer is on ${cfg.network}. Set NEXT_PUBLIC_SUI_NETWORK=${cfg.network} and rebuild.`);
      }
      const suiClient = new SuiGrpcClient({ network: NETWORK, baseUrl: cfg.grpcUrl ?? `https://fullnode.${NETWORK}.sui.io:443` });

      const { digest } = await removeDelegateKey({
        packageId: cfg.packageId,
        registryId: cfg.registryId,
        accountId: held.accountId,
        publicKey: held.delegatePublicKey,
        walletSigner: enokiSigner(wallet, account, `sui:${NETWORK}`, suiClient),
        suiNetwork: NETWORK,
        suiClient,
      });
      setTx(digest);
      await fetch("/api/memwal/revoke", { method: "POST" });
      setState("done");
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "Revoke failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={revoke}
        disabled={state !== "idle" || !wallet}
        className="rounded-[8px] border border-danger-line px-[13px] py-[7px] text-[12.5px] text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
      >
        {state === "working" ? "Revoking…" : state === "done" ? "Revoked" : "Revoke delegate key"}
      </button>
      {state === "done" && tx && (
        <p className="mt-2.5 text-[12px] text-ink-muted">
          Removed onchain.{" "}
          <a className="underline" href={`https://suiscan.xyz/${NETWORK}/tx/${tx}`} target="_blank" rel="noreferrer">View transaction</a>.
          The relayer may keep accepting the key for about 25 seconds.
        </p>
      )}
      {error && <p role="alert" className="mt-2.5 text-[12.5px] text-danger">{error}</p>}
    </>
  );
}
