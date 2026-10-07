"use client";

import { useEffect, useState } from "react";
import { SuiClient, getFullnodeUrl } from "@mysten/sui-enoki/client";
import { registerEnokiWallets, type EnokiWallet } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { addDelegateKey, generateDelegateKey } from "@mysten-incubation/memwal/account";
import { enokiSigner } from "@/lib/enoki-signer";
import { friendlyError } from "@/lib/friendly-errors";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "mainnet";
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

type Props = {
  address: string;
  clientName: string;
  /** Where the grant goes after approval, in plain words (already derived on the server). */
  destination: string;
  scopes: string[];
  nonce: string;
  devMock: boolean;
};

const btn =
  "rounded-[8px] border border-line px-[13px] py-[9px] text-[13px] transition-[background-color,transform] duration-200 hover:bg-surface active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

/**
 * Consent for connecting an AI app. The app gets its OWN delegate key on your
 * account, made here in your browser by your wallet, so disconnecting it never
 * affects anything else. Nothing is granted until Approve, and the buttons act on
 * a request this browser already holds (the nonce), not on anything in the URL.
 */
export default function OAuthConsent({ address, clientName, destination, scopes, nonce, devMock }: Props) {
  const [wallet, setWallet] = useState<EnokiWallet | null>(null);
  const [write, setWrite] = useState(scopes.includes("memory:write"));
  const [busy, setBusy] = useState<null | "approve" | "deny">(null);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (devMock) return;
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
  }, [devMock]);

  async function send(payload: Record<string, unknown>) {
    const res = await fetch("/oauth/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce, ...payload }),
    });
    const body = (await res.json().catch(() => ({}))) as { redirect?: string; message?: string; error?: string };
    if (!res.ok || !body.redirect) throw new Error(body.message ?? body.error ?? `Request failed (${res.status})`);
    window.location.href = body.redirect;
  }

  const chosen = () => scopes.filter((s) => s !== "memory:write" || write);

  async function approve() {
    setBusy("approve");
    setError(null);
    try {
      if (devMock) {
        setStep("Approving (development mock)…");
        return await send({ devMock: true, scopes: chosen() });
      }
      if (!wallet) throw new Error("Sign-in is not configured on this server.");

      setStep("Checking your account…");
      const found = await fetch("/api/memwal/account");
      if (!found.ok) throw new Error(await found.text());
      const accountId = ((await found.json()) as { accountId: string | null }).accountId;
      if (!accountId) throw new Error("Create your memory account first.");

      const cfgRes = await fetch("/api/memwal/config");
      if (!cfgRes.ok) throw new Error(await cfgRes.text());
      const cfg = await cfgRes.json();
      if (cfg.network !== NETWORK) throw new Error(`This app is built for ${NETWORK} but its relayer is on ${cfg.network}.`);

      setStep("Connecting your wallet…");
      const { accounts } = await wallet.features["standard:connect"].connect();
      const account = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
      if (!account) throw new Error("Your wallet is on a different address than this session. Sign out and back in.");

      const suiClient = new SuiGrpcClient({ network: NETWORK, baseUrl: cfg.grpcUrl ?? `https://fullnode.${NETWORK}.sui.io:443` });
      const delegate = await generateDelegateKey();

      setStep(`Registering a key for ${clientName} onchain…`);
      await addDelegateKey({
        packageId: cfg.packageId,
        registryId: cfg.registryId,
        accountId,
        publicKey: delegate.publicKey,
        label: `Fuuud connector: ${clientName}`.slice(0, 60),
        walletSigner: enokiSigner(wallet, account, `sui:${NETWORK}`, suiClient),
        suiNetwork: NETWORK,
        suiClient,
      });

      setStep("Waiting for the relayer to accept the key…");
      await send({ publicKey: hex(delegate.publicKey), privateKey: delegate.privateKey, scopes: chosen() });
    } catch (e) {
      setBusy(null);
      setStep("");
      setError(friendlyError(e, "Could not complete the connection.", NETWORK));
    }
  }

  async function deny() {
    setBusy("deny");
    try {
      await send({ deny: true });
    } catch (e) {
      setBusy(null);
      setError(friendlyError(e, "Could not cancel.", NETWORK));
    }
  }

  return (
    <div className="w-full max-w-md">
      <p className="eyebrow">Connect an app</p>
      <h1 className="mt-3.5 text-2xl font-medium leading-tight tracking-[-0.015em]">
        Let <span className="break-words">{clientName}</span> use your health memory?
      </h1>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
        The app chose that name itself, and we have not verified it. After you approve you go back to {destination}.
      </p>

      <fieldset className="mt-6 rounded-lg border border-line-soft px-3.5 py-3">
        <legend className="eyebrow px-1">What it can do</legend>
        <label className="flex items-start gap-3 py-1.5 text-[13px] leading-snug text-ink-muted">
          <input type="checkbox" checked disabled className="mt-0.5 accent-[var(--c-accent)]" />
          <span><strong className="font-medium text-ink">Read.</strong> Look up your conditions, allergies and past reactions, and check meals against them.</span>
        </label>
        {scopes.includes("memory:write") && (
          <label className="flex items-start gap-3 py-1.5 text-[13px] leading-snug text-ink-muted">
            <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} disabled={busy !== null} className="mt-0.5 accent-[var(--c-accent)]" />
            <span><strong className="font-medium text-ink">Write.</strong> Save new facts and retract old ones. Retracting an allergy needs your own request in the chat.</span>
          </label>
        )}
      </fieldset>

      <ul className="mt-5 space-y-2 text-[12px] leading-relaxed text-ink-muted">
        <li>It gets its <strong className="font-medium text-ink">own key</strong> on your account. Disconnect it any time in Settings and it stops immediately.</li>
        <li>So it can work when your browser is closed, <strong className="font-medium text-ink">this server keeps that key, encrypted</strong>.</li>
        <li>Anything it reads becomes part of your conversation with that AI service, under that service&apos;s privacy policy.</li>
        <li>Read and write limits are enforced by us. The key itself can do both on Walrus.</li>
      </ul>

      <p className="mt-5 rounded-lg border border-warn-line px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-muted">
        Only continue if you just pressed <strong className="font-medium text-ink">Connect</strong> in {clientName}. If someone sent you this page, close it.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={approve}
          disabled={busy !== null || (!devMock && !wallet)}
          className="cta h-[48px] flex-1 text-[14px] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {busy === "approve" ? step || "Working…" : "Approve"}
        </button>
        <button type="button" onClick={deny} disabled={busy !== null} className={btn}>
          {busy === "deny" ? "Cancelling…" : "Deny"}
        </button>
      </div>

      <div aria-live="polite">
        {error && <p role="alert" className="mt-4 rounded-lg border border-danger-line px-3 py-2.5 text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
