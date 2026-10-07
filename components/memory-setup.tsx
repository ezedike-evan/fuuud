"use client";

import { useEffect, useState } from "react";
import { SuiClient, getFullnodeUrl } from "@mysten/sui-enoki/client";
import { registerEnokiWallets, type EnokiWallet } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { createAccount, addDelegateKey, generateDelegateKey } from "@mysten-incubation/memwal/account";
import { enokiSigner } from "@/lib/enoki-signer";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "mainnet";
const CHAIN = `sui:${NETWORK}` as const;
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

type Step = "idle" | "wallet" | "account" | "delegate" | "verify" | "done";
const LABEL: Record<Step, string> = {
  idle: "Create my memory account",
  wallet: "Connecting your wallet…",
  account: "Creating your account onchain…",
  delegate: "Registering this app as your delegate…",
  verify: "Waiting for the relayer to see the key…",
  done: "Done",
};

/**
 * Your wallet creates YOUR MemWalAccount and registers this app's delegate key
 * on it. Nothing here is signed by the server. The delegate key is the only
 * secret that leaves the browser, and it is the one you can revoke.
 */
export default function MemorySetup({ address }: { address: string }) {
  const [wallet, setWallet] = useState<EnokiWallet | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

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

  async function run() {
    if (!wallet) return;
    setError(null);
    try {
      setStep("wallet");
      const { accounts } = await wallet.features["standard:connect"].connect();
      const account = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
      if (!account) throw new Error("Your wallet is on a different address than this session. Sign out and back in.");
      const cfgRes = await fetch("/api/memwal/config");
      if (!cfgRes.ok) throw new Error(await cfgRes.text());
      const cfg = (await cfgRes.json()) as { packageId: string; registryId: string; network: "testnet" | "mainnet"; grpcUrl: string | null };
      // The wallet, the relayer and the Enoki key must all be on ONE network. A
      // testnet-registered wallet signing against the mainnet relayer fails deep
      // inside the sponsor call with an error that names none of this.
      if (cfg.network !== NETWORK) {
        throw new Error(
          `This app is built for ${NETWORK} but its relayer is on ${cfg.network}. Set NEXT_PUBLIC_SUI_NETWORK=${cfg.network} (and rebuild), or point MEMWAL_SERVER_URL at the ${NETWORK} relayer.`,
        );
      }
      const suiClient = new SuiGrpcClient({
        network: NETWORK,
        baseUrl: cfg.grpcUrl ?? `https://fullnode.${NETWORK}.sui.io:443`,
      });
      const signer = enokiSigner(wallet, account, CHAIN, suiClient);
      const base = { packageId: cfg.packageId, registryId: cfg.registryId, walletSigner: signer, suiNetwork: NETWORK, suiClient } as const;

      // Reuse the account if this address already has one: the chain knows it, so
      // clearing site data never strands a person on "already exists".
      let accountId = "";
      {
        const found = await fetch("/api/memwal/account");
        if (found.ok) accountId = ((await found.json()) as { accountId: string | null }).accountId ?? "";
      }
      if (!accountId) {
        setStep("account");
        accountId = (await createAccount(base)).accountId;
      }

      setStep("delegate");
      const delegate = await generateDelegateKey();
      await addDelegateKey({ ...base, accountId, publicKey: delegate.publicKey, label: "Fuuud" });

      setStep("verify");
      const res = await fetch("/api/memwal/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, delegateKey: delegate.privateKey, delegatePublicKey: hex(delegate.publicKey) }),
      });
      if (!res.ok) throw new Error(await res.text());

      setStep("done");
      const waiting = await fetch("/api/oauth/pending").then((r) => r.json()).catch(() => ({ pending: false }));
      window.location.href = waiting.pending ? "/oauth/consent" : "/agent";
    } catch (e) {
      setStep("idle");
      setError(e instanceof Error ? e.message : "Setup failed");
    }
  }

  const busy = step !== "idle";
  return (
    <div className="w-full max-w-md">
      <p className="eyebrow">One-time setup</p>
      <h2 className="mt-3.5 text-2xl font-medium leading-tight tracking-[-0.015em]">Your memory, your account.</h2>
      <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
        Your wallet creates a Walrus Memory account that only you own, then registers this app as a
        delegate you can revoke. No one else&apos;s key can read it.
      </p>

      <div className="mt-5 rounded-lg border border-line-soft px-3.5 py-3">
        <p className="eyebrow">Your Sui address</p>
        <p className="mt-1.5 break-all font-mono text-[12px] leading-relaxed text-ink">{address}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
          Setup is two onchain transactions signed by you. Gas is sponsored, so this address does not
          need any SUI.
        </p>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={busy || !wallet}
        className="cta mt-[26px] h-[54px] w-full text-[15px] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {LABEL[step]}
      </button>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-danger-line px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
