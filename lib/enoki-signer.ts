import type { EnokiWallet } from "@mysten/enoki";
import { Transaction } from "@mysten/sui/transactions";
import { createSponsorAuthorization } from "@mysten-incubation/memwal";
import type { createAccount } from "@mysten-incubation/memwal/account";

// Not exported by name from the SDK; derived from the function that takes it.
type WalletSigner = NonNullable<Parameters<typeof createAccount>[0]["walletSigner"]>;

/**
 * Adapts the Enoki zkLogin wallet to the MemWal SDK's WalletSigner, so the
 * person's OWN address signs createAccount / addDelegateKey / removeDelegateKey
 * in their browser. The server never sees an owner key.
 *
 * EVERY transaction is sponsored; there is deliberately no self-pay path. A
 * fresh zkLogin address holds 0 SUI, and a self-pay fallback fails in the Sui
 * gas resolver with "No valid gas coins found", which hides the real cause.
 * This is how MemWal's own app does it.
 *
 *   1. build the TransactionKind (no gas data)
 *   2. POST /api/memwal/sponsor        -> relayer -> Enoki   => { bytes, digest }
 *   3. the wallet signs the sponsored bytes (silent for zkLogin)
 *   4. POST /api/memwal/sponsor/execute                      => { digest }
 *
 * The sponsor calls go through our own origin because the relayer's CORS does
 * not allow arbitrary ones (see lib/sponsor-proxy.ts).
 *
 * `chain` is passed on every wallet call: Enoki validates it and rejects
 * undefined (same reason as in components/sign-in.tsx).
 *
 * The wallet (@mysten/enoki 1.x) and the SDK share one @mysten/sui 2.x, so the sponsored
 * transaction goes to the wallet unchanged. With the old 0.6.x wallet (sui 1.33) this step
 * failed with "Invalid type: Expected Object but received Object" as soon as the sponsor
 * returned a ValidDuring expiry, which sui 1.33 cannot parse. Do not re-add an alias to sui 1.x.
 */

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class SponsorError extends Error {
  constructor(readonly status: number, readonly detail: string, readonly code?: string, readonly traceId?: string) {
    super(detail);
    this.name = "SponsorError";
  }
}

/** 408/429/500/503/504 are transient. 502 means the sponsor rejected the transaction itself: retrying cannot help. */
const retryable = (e: unknown) =>
  e instanceof TypeError || (e instanceof SponsorError && [408, 429, 500, 503, 504].includes(e.status));

function explain(e: unknown): string {
  if (e instanceof TypeError) return "Network error reaching the sponsor service. Check your connection and try again.";
  if (e instanceof SponsorError) {
    const trace = e.traceId ? ` (traceId: ${e.traceId})` : "";
    if (e.status === 429) return "Too many requests. Wait a moment and try again.";
    if (e.status === 401 || e.status === 403) return `Not allowed: ${e.detail}. Sign out and back in.`;
    if (e.code === "sponsor_misconfigured") return `The sponsor service is misconfigured on the relayer.${trace}`;
    if (e.status === 502) return `The sponsor rejected this transaction. It may be invalid or already applied. Refresh and try again.${trace}`;
    if (e.status >= 500) return `The sponsor service is temporarily unavailable. Try again in a moment.${trace}`;
    return `${e.detail}${trace}`;
  }
  return e instanceof Error ? e.message : "Transaction sponsorship failed.";
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    let parsed: { error?: string; code?: string; traceId?: string } = {};
    try { parsed = JSON.parse(text); } catch { /* plain-text error */ }
    throw new SponsorError(res.status, parsed.error ?? (text || `HTTP ${res.status}`), parsed.code, parsed.traceId);
  }
  return JSON.parse(text) as T;
}

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

export function enokiSigner(
  wallet: EnokiWallet,
  account: Parameters<EnokiWallet["features"]["sui:signPersonalMessage"]["signPersonalMessage"]>[0]["account"],
  chain: `sui:${string}`,
  /** A Sui client for the network the relayer is on, used to resolve inputs when building the transaction kind. */
  suiClient: unknown,
): WalletSigner {
  const signPersonalMessage = async ({ message }: { message: Uint8Array }) => {
    const { signature } = await wallet.features["sui:signPersonalMessage"].signPersonalMessage({ message, account, chain });
    return { signature };
  };

  return {
    address: account.address,
    signPersonalMessage,

    async signAndExecuteTransaction({ transaction }) {
      const sender = account.address;
      // The kind never changes across retries, so it is built once.
      const kindBytes: Uint8Array = await (transaction as Transaction).build({
        client: suiClient as never,
        onlyTransactionKind: true,
      });
      const transactionBlockKindBytes = toBase64(kindBytes);

      let last: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          // A fresh nonce and timestamp per attempt: the relayer rejects a replay.
          const auth = await createSponsorAuthorization(sender, kindBytes, (m) => signPersonalMessage({ message: m }));
          const sponsored = await post<{ bytes: string; digest: string }>("/api/memwal/sponsor", {
            transactionBlockKindBytes,
            sender,
            ...auth,
          });
          const { signature } = await wallet.features["sui:signTransaction"].signTransaction({
            transaction: Transaction.from(sponsored.bytes),
            account,
            chain,
          });
          const executed = await post<{ digest: string }>("/api/memwal/sponsor/execute", {
            digest: sponsored.digest,
            sender,
            signature,
          });
          return { digest: executed.digest };
        } catch (error) {
          last = error;
          if (!retryable(error) || attempt === MAX_ATTEMPTS) break;
          await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
        }
      }
      throw new Error(explain(last));
    },
  };
}
