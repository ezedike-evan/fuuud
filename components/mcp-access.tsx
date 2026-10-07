"use client";

import { useEffect, useState } from "react";
import { SuiClient, getFullnodeUrl } from "@mysten/sui-enoki/client";
import { registerEnokiWallets, type EnokiWallet } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { addDelegateKey, generateDelegateKey } from "@mysten-incubation/memwal/account";
import { enokiSigner } from "@/lib/enoki-signer";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "mainnet";
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

type Issued = { env: Record<string, string>; publicKey: string };

const btn =
  "rounded-[8px] border border-line px-[13px] py-[7px] text-[12.5px] transition-[background-color,transform] duration-200 hover:bg-surface active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

/**
 * Gives a coding agent (Claude Code, Cursor) its OWN delegate key on YOUR
 * account, so the MCP server can read and write the same record the web app
 * does. The key is generated in this browser, registered onchain by your wallet,
 * and shown once - it never touches our server, which is the point: this app
 * does not hold your agent's key.
 */
export default function McpAccess({ address }: { address: string }) {
  const [wallet, setWallet] = useState<EnokiWallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function issue() {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      const found = await fetch("/api/memwal/account");
      if (!found.ok) throw new Error(await found.text());
      const accountId = ((await found.json()) as { accountId: string | null }).accountId;
      if (!accountId) throw new Error("Create your memory account first.");
      const cfgRes = await fetch("/api/memwal/config");
      if (!cfgRes.ok) throw new Error(await cfgRes.text());
      const cfg = await cfgRes.json();
      if (cfg.network !== NETWORK) {
        throw new Error(`This app is built for ${NETWORK} but its relayer is on ${cfg.network}. Set NEXT_PUBLIC_SUI_NETWORK=${cfg.network} and rebuild.`);
      }

      const { accounts } = await wallet.features["standard:connect"].connect();
      const account = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
      if (!account) throw new Error("Your wallet is on a different address than this session.");

      const suiClient = new SuiGrpcClient({ network: NETWORK, baseUrl: cfg.grpcUrl ?? `https://fullnode.${NETWORK}.sui.io:443` });
      const delegate = await generateDelegateKey();
      await addDelegateKey({
        packageId: cfg.packageId,
        registryId: cfg.registryId,
        accountId,
        publicKey: delegate.publicKey,
        label: "Fuuud MCP agent",
        walletSigner: enokiSigner(wallet, account, `sui:${NETWORK}`, suiClient),
        suiNetwork: NETWORK,
        suiClient,
      });

      setIssued({
        publicKey: hex(delegate.publicKey),
        env: {
          MEMWAL_PRIVATE_KEY: delegate.privateKey,
          MEMWAL_ACCOUNT_ID: accountId,
          MEMWAL_SERVER_URL: cfg.relayerUrl,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create an agent key.");
    } finally {
      setBusy(false);
    }
  }

  const snippet = issued
    ? JSON.stringify(
        {
          mcpServers: {
            fuuud: {
              command: "node",
              args: ["--experimental-strip-types", "mcp/server.mts"],
              cwd: "/absolute/path/to/fuuud",
              env: issued.env,
            },
          },
        },
        null,
        2,
      )
    : "";

  return (
    <section className="rounded-[10px] border border-line px-5 py-[18px] lg:col-span-2">
      <h2 className="mb-1.5 text-sm font-medium">Connect a coding agent (MCP)</h2>
      <p className="mb-4 max-w-[68ch] text-[12.5px] leading-relaxed text-ink-muted">
        Creates a separate key on your account for Claude Code, Cursor or any MCP client, so the same
        record and the same allergen screen work there. It is made in this browser and shown once; we
        never receive it. It can read and write your whole record until you remove it onchain.
      </p>

      {!issued ? (
        <button type="button" className={btn} disabled={busy || !wallet} onClick={issue}>
          {busy ? "Registering the key onchain…" : "Create an agent key"}
        </button>
      ) : (
        <div>
          <p className="mb-2 text-[12.5px] text-danger">Copy this now. It will not be shown again.</p>
          <pre className="scroll-quiet max-h-64 overflow-auto rounded-[8px] border border-line-soft bg-recess p-3.5 font-mono text-[11.5px] leading-relaxed">{snippet}</pre>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={btn}
              onClick={() => navigator.clipboard.writeText(snippet).then(() => setCopied(true), () => setError("Copy failed. Select the text and copy it by hand."))}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <span className="font-mono text-[11px] text-ink-faint break-all">
              To remove it later, call removeDelegateKey with public key {issued.publicKey}
            </span>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-[12.5px] text-danger">{error}</p>}
    </section>
  );
}
