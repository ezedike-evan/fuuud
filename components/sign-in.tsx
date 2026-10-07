"use client";

import { useEffect, useState } from "react";
// Enoki 0.6.x depends on @mysten/sui@1.33.0 and its SuiClient type is not
// compatible with the v2 line that @mysten-incubation/memwal requires. The
// alias pins the exact version enoki expects, so no cast is needed here.
import { SuiClient, getFullnodeUrl } from "@mysten/sui-enoki/client";
import { registerEnokiWallets, type EnokiWallet } from "@mysten/enoki";
import { friendlyError } from "@/lib/friendly-errors";

/*
 * One network constant for the SuiClient, the wallet registration and the
 * `chain` argument below. Enoki's wallet validates `chain` against the list it
 * was registered with and throws "A valid Sui chain identifier was not
 * provided in the request" when it is missing or from another network — so
 * these three must never drift apart.
 */
const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "mainnet";
const CHAIN = `sui:${NETWORK}` as const;

/**
 * Enoki zkLogin sign-in. Uses `registerEnokiWallets` rather than `EnokiFlow` —
 * EnokiFlow is marked deprecated in @mysten/enoki 0.6.x. The wallet exposes the
 * wallet-standard `signPersonalMessage` feature, which is what proves address
 * ownership to our own server.
 */
export default function SignIn() {
  const [wallet, setWallet] = useState<EnokiWallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [redirect, setRedirect] = useState<string | null>(null);
  // Enoki opens its popup BEFORE asking its API for a login nonce, so a refused key leaves a
  // blank window and a console error nobody sees. Ask first and say what is wrong.
  const [blocked, setBlocked] = useState<string | null>(null);
  const [enokiRefused, setEnokiRefused] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_ENOKI_API_KEY;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!apiKey || !clientId) {
      setConfigured(false);
      return;
    }

    /*
     * The redirect URI is passed EXPLICITLY. Enoki's default is
     * `window.location.href.split("#")[0]` — the whole current URL — so the
     * value sent to Google changes with the port Next happened to bind, and
     * with any path or query string the user arrived on. Google matches
     * `redirect_uri` exactly against its registered list, so a drifting value
     * fails with `Error 400: redirect_uri_mismatch` and the app looks broken
     * for reasons that have nothing to do with the code.
     *
     * Pinning it to `<origin>/signin` gives one stable string to register.
     * NEXT_PUBLIC_APP_URL overrides it for deployments, where the origin the
     * browser sees may not be the one you registered.
     */
    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? window.location.origin;
    const redirectUrl = `${origin}/signin`;
    setRedirect(redirectUrl);

    const { wallets, unregister } = registerEnokiWallets({
      apiKey,
      providers: { google: { clientId, redirectUrl } },
      client: new SuiClient({ url: getFullnodeUrl(NETWORK) }),
      network: NETWORK,
    });
    setWallet(wallets.google ?? null);
    return unregister;
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/auth/preflight")
      .then((r) => r.json())
      .then((r: { ok: boolean; problem?: string }) => live && !r.ok && setBlocked(r.problem ?? "Sign-in is not available."))
      .catch(() => {});
    return () => { live = false; };
  }, []);

  async function signIn() {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      const { accounts } = await wallet.features["standard:connect"].connect();
      const account = accounts[0];
      if (!account) throw new Error("No account returned");

      /*
       * Server issues the nonce, so a replayed signature is worthless.
       *
       * Read the status before the body. Calling .json() straight off the
       * response turns every server-side failure into "Unexpected end of JSON
       * input" — a parse error standing in for the real one, which is usually a
       * missing environment variable in the deployment.
       */
      const nonceRes = await fetch("/api/auth/nonce");
      const nonceBody = await nonceRes.text();
      if (!nonceRes.ok) {
        let detail = nonceBody.trim();
        try {
          detail = JSON.parse(nonceBody).error ?? detail;
        } catch {
          // Not JSON — an empty body or an HTML error page. Say so plainly.
        }
        throw new Error(detail || `Sign-in service returned ${nonceRes.status}`);
      }
      const { message } = JSON.parse(nonceBody);

      /*
       * `chain` is required. The wallet-standard type marks it optional, but
       * Enoki validates it on every call and rejects an undefined value, so
       * omitting it fails at signing time with an error that reads like a
       * misconfigured OAuth client rather than a missing argument.
       */
      const { signature } = await wallet.features["sui:signPersonalMessage"].signPersonalMessage({
        message: new TextEncoder().encode(message),
        account,
        chain: CHAIN,
      });

      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signature, address: account.address }),
      });
      if (!res.ok) throw new Error(await res.text());

      // A connection request may be waiting (an AI app sent the person here to approve it).
      const waiting = await fetch("/api/oauth/pending", { signal: AbortSignal.timeout(4000) }).then((r) => r.json()).catch(() => ({ pending: false }));
      window.location.href = waiting.pending ? "/oauth/consent" : "/agent";
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      // Enoki's own refusal is NOT a redirect-URI problem (Google was never reached), so do not
      // send people hunting for one.
      setEnokiRefused(/Enoki API failed/.test(raw));
      setError(friendlyError(e, "Sign-in failed", NETWORK));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <p className="eyebrow">Sign in</p>
      <h2 className="mt-3.5 text-2xl font-medium leading-tight tracking-[-0.015em]">
        No wallet, no seed phrase.
      </h2>
      <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
        Google sign-in creates your Sui address behind the scenes. You&apos;ll never see a gas prompt.
      </p>

      <button
        type="button"
        onClick={signIn}
        disabled={busy || !configured || blocked !== null}
        className="cta mt-[30px] h-[54px] w-full text-[15px] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M21.6 12.23c0-.72-.06-1.4-.19-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.36Z" />
          <path d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.5c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.6-4.12H3.07v2.58A10 10 0 0 0 12 22Z" opacity="0.72" />
          <path d="M6.4 13.93a6 6 0 0 1 0-3.83V7.52H3.07a10 10 0 0 0 0 8.98l3.33-2.57Z" opacity="0.5" />
          <path d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.86-2.86C16.95 2.98 14.7 2 12 2a10 10 0 0 0-8.93 5.52L6.4 10.1C7.2 7.74 9.4 5.98 12 5.98Z" opacity="0.86" />
        </svg>
        {busy ? "Signing in…" : "Continue with Google"}
      </button>

      {blocked && (
        <p role="alert" className="mt-4 rounded-lg border border-danger-line px-3 py-2.5 text-[12.5px] leading-relaxed text-danger">
          {blocked}
        </p>
      )}

      {!configured && (
        <p className="mt-4 rounded-lg border border-warn-line px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
          Sign-in needs <code className="font-mono text-ink">NEXT_PUBLIC_ENOKI_API_KEY</code> and{" "}
          <code className="font-mono text-ink">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>. Set{" "}
          <code className="font-mono text-ink">DEV_FAKE_ADDRESS</code> to try the memory flow without them.
        </p>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-danger-line px-3 py-2.5 text-sm text-danger">
          <p>{error}</p>
          {/*
            Google reports redirect_uri_mismatch on its own page, not back to
            us, so this never renders for that case — but the URI is the first
            thing you need either way, and reverse-engineering it from the SDK
            default is a waste of an afternoon. Shown for sign-in failures, except when Enoki itself refused: Google was never reached, so the URI is not the cause.
          */}
          {redirect && !enokiRefused && (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              This app sends{" "}
              <code className="font-mono break-all text-ink">{redirect}</code> as its redirect URI.
              It must be registered verbatim in the Google OAuth client and in the Enoki portal.
            </p>
          )}
        </div>
      )}

      <p className="mt-[30px] border-t border-line-soft pt-5 text-[11.5px] leading-relaxed text-ink-faint">
        Health guidance only — not medical advice. Your memory is encrypted before it leaves this
        device, and only you hold the keys.
      </p>
    </div>
  );
}
