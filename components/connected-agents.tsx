"use client";

import { useEffect, useState, useTransition } from "react";
import { SuiClient, getFullnodeUrl } from "@mysten/sui-enoki/client";
import { registerEnokiWallets, type EnokiWallet } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { removeDelegateKey } from "@mysten-incubation/memwal/account";
import { disconnectApp, type ConnectedApp } from "@/app/actions/connectors";
import { enokiSigner } from "@/lib/enoki-signer";
import { friendlyError } from "@/lib/friendly-errors";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "mainnet";

const btn =
  "rounded-[8px] border border-line px-[13px] py-[7px] text-[12.5px] transition-[background-color,transform] duration-200 hover:bg-surface active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

const scopeLabel = (scopes: string[]) => (scopes.includes("memory:write") ? "Read and write" : "Read only");
const when = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The AI apps connected to your memory. Disconnecting stops an app at once, on
 * this server. Removing its key from your account onchain is a separate step that
 * needs your wallet, offered right after: until then the key exists, but nothing
 * here holds it any more.
 */
export default function ConnectedAgents({ address, initial, error }: { address: string; initial: ConnectedApp[]; error?: string }) {
  const [apps, setApps] = useState(initial);
  const [armed, setArmed] = useState<string | null>(null);
  const [orphan, setOrphan] = useState<{ name: string; publicKey: string } | null>(null);
  const [note, setNote] = useState<string | null>(error ?? null);
  const [problem, setProblem] = useState<string | null>(null);
  const [wallet, setWallet] = useState<EnokiWallet | null>(null);
  const [working, setWorking] = useState(false);
  const [pending, start] = useTransition();

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

  function disconnect(app: ConnectedApp) {
    setProblem(null);
    start(async () => {
      try {
        const { publicKey } = await disconnectApp(app.id);
        setApps((list) => list.filter((a) => a.id !== app.id));
        setArmed(null);
        setNote(`${app.name} was disconnected. It can no longer read or write your memory.`);
        if (publicKey && publicKey !== "dev") setOrphan({ name: app.name, publicKey });
      } catch (e) {
        setProblem(friendlyError(e, "Could not disconnect.", NETWORK));
      }
    });
  }

  async function removeKey() {
    if (!wallet || !orphan) return;
    setWorking(true);
    setProblem(null);
    try {
      const held = await (await fetch("/api/memwal/account")).json();
      if (!held.accountId) throw new Error("No account found.");
      const cfg = await (await fetch("/api/memwal/config")).json();
      if (cfg.network !== NETWORK) throw new Error(`This app is built for ${NETWORK} but its relayer is on ${cfg.network}.`);
      const { accounts } = await wallet.features["standard:connect"].connect();
      const account = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
      if (!account) throw new Error("Your wallet is on a different address than this session.");
      const suiClient = new SuiGrpcClient({ network: NETWORK, baseUrl: cfg.grpcUrl ?? `https://fullnode.${NETWORK}.sui.io:443` });
      await removeDelegateKey({
        packageId: cfg.packageId,
        registryId: cfg.registryId,
        accountId: held.accountId,
        publicKey: orphan.publicKey,
        walletSigner: enokiSigner(wallet, account, `sui:${NETWORK}`, suiClient),
        suiNetwork: NETWORK,
        suiClient,
      });
      setNote(`The key for ${orphan.name} was removed from your account onchain. The relayer may accept it for about 25 more seconds.`);
      setOrphan(null);
    } catch (e) {
      setProblem(friendlyError(e, "Could not remove the key.", NETWORK));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="rounded-[10px] border border-line px-5 py-[18px] lg:col-span-2">
      <h2 className="mb-1.5 text-sm font-medium">Connected apps</h2>
      <p className="mb-4 max-w-[68ch] text-[12.5px] leading-relaxed text-ink-muted">
        AI apps you have allowed to use your health memory, such as Claude or ChatGPT. Each one has its own key. Disconnecting stops it immediately.
      </p>

      {apps.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-line px-3.5 py-4 text-[12.5px] text-ink-faint">
          Nothing connected. Add this app&apos;s address as a custom connector in your AI app and approve it when asked.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-[8px] border border-line">
          {apps.map((app) => (
            <li key={app.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px]">{app.name}</p>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-faint">
                  {scopeLabel(app.scopes)} · connected {when(app.created)}
                  {app.status === "pending" ? " · never used" : ""}
                </p>
              </div>
              {armed === app.id ? (
                <span className="flex items-center gap-2.5">
                  <button type="button" onClick={() => disconnect(app)} disabled={pending} className="text-[12.5px] text-danger hover:opacity-80 disabled:opacity-50">
                    {pending ? "Disconnecting…" : "Disconnect"}
                  </button>
                  <button type="button" onClick={() => setArmed(null)} className="text-[12.5px] text-ink-faint hover:text-ink">Keep</button>
                </span>
              ) : (
                <button type="button" onClick={() => setArmed(app.id)} className="text-[12.5px] text-ink-faint transition-colors hover:text-danger">Disconnect</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {orphan && (
        <div className="mt-4 rounded-[8px] border border-warn-line px-3.5 py-3">
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            <strong className="font-medium text-ink">One more step.</strong> {orphan.name} is disconnected, but its key is still registered on your account. Remove it so it can never be used again.
          </p>
          <button type="button" className={`${btn} mt-2.5`} onClick={removeKey} disabled={working || !wallet}>
            {working ? "Removing the key onchain…" : "Remove its key onchain"}
          </button>
        </div>
      )}

      <div aria-live="polite">
        {note && <p className="mt-3 text-[12.5px] text-ink-muted">{note}</p>}
        {problem && <p role="alert" className="mt-3 text-[12.5px] text-danger">{problem}</p>}
      </div>
    </section>
  );
}
