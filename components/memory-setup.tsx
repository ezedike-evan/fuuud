"use client";

import { useEffect, useState } from "react";
import { SuiClient, getFullnodeUrl } from "@mysten/sui-enoki/client";
import { registerEnokiWallets, type EnokiWallet } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { createAccount, addDelegateKey, generateDelegateKey } from "@mysten-incubation/memwal/account";
import { enokiSigner } from "@/lib/enoki-signer";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as "testnet" | "mainnet";
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
  const [existing, setExisting] = useState("");
  const [needsExisting, setNeedsExisting] = useState(false);

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
      const signer = enokiSigner(wallet, account, CHAIN);

      const cfgRes = await fetch("/api/memwal/config");
      if (!cfgRes.ok) throw new Error(await cfgRes.text());
      const cfg = (await cfgRes.json()) as { packageId: string; registryId: string; grpcUrl: string | null };
      const suiClient = new SuiGrpcClient({
        network: NETWORK,
        baseUrl: cfg.grpcUrl ?? `https://fullnode.${NETWORK}.sui.io:443`,
      });
      const base = { packageId: cfg.packageId, registryId: cfg.registryId, walletSigner: signer, suiNetwork: NETWORK, suiClient } as const;

      let accountId = existing.trim();
      if (!accountId) {
        setStep("account");
        try {
          accountId = (await createAccount(base)).accountId;
        } catch (e) {
          // One account per address, enforced by the contract. If it already
          // exists we cannot discover its id from here - ask for it.
          const msg = e instanceof Error ? e.message : String(e);
          if (/already|exist|abort|EAccountExists/i.test(msg)) {
            setNeedsExisting(true);
            throw new Error("This address already has an account. Paste its object id below and run again.");
          }
          throw e;
        }
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
      window.location.href = "/agent";
    } catch (e) {
      setStep("idle");
      const msg = e instanceof Error ? e.message : "Setup failed";
      // The most common first-run failure: a brand-new zkLogin address holds no SUI.
      setError(/gas|balance|insufficient|coin/i.test(msg) ? `${msg} — fund ${address} with testnet SUI at https://faucet.sui.io and try again.` : msg);
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

      {needsExisting && (
        <input
          value={existing}
          onChange={(e) => setExisting(e.target.value)}
          placeholder="0x… existing account object id"
          className="mt-5 h-11 w-full rounded-lg border border-line-soft bg-transparent px-3 font-mono text-[12.5px]"
        />
      )}

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
