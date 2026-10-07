"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DelegateKey, KeyKind } from "@/lib/delegate-keys";
import { friendlyError } from "@/lib/friendly-errors";
import { removeKeyOnchain } from "@/lib/remove-key";
import { NETWORK, useEnokiWallet } from "@/lib/use-enoki-wallet";

type Listed = DelegateKey & { kind: KeyKind };
type Payload = { accountId: string | null; max: number; keys: Listed[] };

const KIND_LABEL: Record<KeyKind, string> = {
  "this-browser": "This browser",
  connector: "Connected app",
  agent: "Agent key",
  other: "Other device or key",
};

const btn =
  "rounded-[8px] border border-line px-[13px] py-[7px] text-[12.5px] transition-[background-color,transform] duration-200 hover:bg-surface active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

const when = (ms: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : "unknown date");

/**
 * Every key registered on your account, with what each one is.
 *
 * Each browser, device and connected app holds a key of its own, and an account can hold at
 * most 20. A key's private half exists only where it was created, so a new device cannot
 * reuse an old key: it adds one. This is where old ones get pruned. Removing is forward-only
 * and is signed by YOUR wallet.
 */
export default function KeyManager({ address, onBelowCap, heading = "Keys on your account" }: { address: string; onBelowCap?: () => void; heading?: string }) {
  const wallet = useEnokiWallet();
  const [data, setData] = useState<Payload | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Held in a ref: a parent that passes a fresh arrow function every render must not make `load` change
  // identity, or the effect below would refetch on every parent render.
  const belowCap = useRef(onBelowCap);
  belowCap.current = onBelowCap;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/memwal/keys", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const next = (await res.json()) as Payload;
      setData(next);
      setError(null);
      if (next.keys.length < next.max) belowCap.current?.();
    } catch (e) {
      setError(friendlyError(e, "Could not read your keys.", NETWORK));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(key: Listed) {
    if (!wallet || !data?.accountId) return;
    setWorking(key.publicKey);
    setError(null);
    setNote(null);
    try {
      await removeKeyOnchain({ wallet, address, accountId: data.accountId, publicKey: key.publicKey });
      if (key.kind === "this-browser") {
        // This browser just removed its own key: drop our copy too, so it re-registers instead of failing.
        await fetch("/api/memwal/revoke", { method: "POST" }).catch(() => {});
        window.location.href = "/setup?refused=1";
        return;
      }
      setNote("Removed. The relayer may accept that key for about 25 more seconds.");
      setArmed(null);
      await load();
    } catch (e) {
      setError(friendlyError(e, "Could not remove that key.", NETWORK));
    } finally {
      setWorking(null);
    }
  }

  if (!data && !error) return <p className="text-[12.5px] text-ink-faint">Reading your keys…</p>;

  const atCap = data ? data.keys.length >= data.max : false;
  return (
    <section className="rounded-[10px] border border-line px-5 py-[18px] lg:col-span-2" aria-labelledby="keys-heading">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 id="keys-heading" className="text-sm font-medium">{heading}</h2>
        {data && (
          <span className={`font-mono text-[11.5px] tabular-nums ${atCap ? "text-danger" : "text-ink-faint"}`}>
            {data.keys.length} of {data.max}
          </span>
        )}
      </div>
      <p className="mb-4 max-w-[68ch] text-[12.5px] leading-relaxed text-ink-muted">
        Every browser, device and connected app holds a key of its own. A key&apos;s secret half never leaves the place that made it, so a new
        device cannot reuse an old key and adds a new one. An account holds at most 20. Remove the ones you no longer use.
      </p>

      {atCap && (
        <p role="alert" className="mb-4 rounded-[8px] border border-danger-line px-3.5 py-2.5 text-[12.5px] leading-relaxed text-danger">
          Your account holds the maximum of {data?.max} keys, so nothing new can be added until you remove one below.
        </p>
      )}

      {data && data.keys.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-line px-3.5 py-4 text-[12.5px] text-ink-faint">No keys are registered on this account.</p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-[8px] border border-line">
          {data?.keys.map((k) => {
            const isConnector = k.kind === "connector";
            return (
              <li key={k.publicKey} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px]">{k.label || "Unnamed key"}</p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-faint">
                    {KIND_LABEL[k.kind]} · added {when(k.createdAt)} · {k.address.slice(0, 6)}…{k.address.slice(-4)}
                  </p>
                </div>

                {isConnector ? (
                  <span className="text-[12px] text-ink-faint">Disconnect it under Connected apps</span>
                ) : armed === k.publicKey ? (
                  <span className="flex items-center gap-2.5">
                    <button type="button" onClick={() => remove(k)} disabled={working !== null || !wallet} className="min-h-10 text-[12.5px] text-danger hover:opacity-80 disabled:opacity-50">
                      {working === k.publicKey ? "Removing onchain…" : k.kind === "this-browser" ? "Remove and sign this browser out of memory" : "Remove"}
                    </button>
                    <button type="button" onClick={() => setArmed(null)} disabled={working !== null} className="min-h-10 text-[12.5px] text-ink-faint hover:text-ink">Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setArmed(k.publicKey)} className="min-h-10 text-[12.5px] text-ink-faint transition-colors hover:text-danger">Remove</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div aria-live="polite">
        {note && <p className="mt-3 text-[12.5px] text-ink-muted">{note}</p>}
        {error && <p role="alert" className="mt-3 text-[12.5px] text-danger">{error}</p>}
      </div>
      <button type="button" className={`${btn} mt-3`} onClick={() => void load()}>Refresh</button>
    </section>
  );
}
