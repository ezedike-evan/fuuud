/**
 * Turn the raw errors that reach the screen during sign-in, account setup and
 * connecting an app into sentences a person can act on.
 *
 * What people actually hit is a Sui, wallet or Enoki internal message such as
 * "Object 0x8bf8... not found" or "Request to Enoki API failed (status: 403)". None
 * of those say what to do. This recognises the common ones and leaves everything
 * else untouched, so a genuinely new error is still shown as it is rather than
 * hidden behind a vague line.
 *
 * Client-safe: no `server-only`, no imports.
 */

export function friendlyError(error: unknown, fallback: string, network?: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw) return fallback;
  const where = network ? ` on ${network}` : "";

  const missing = /Object (0x[0-9a-fA-F]{64}) not found/.exec(raw);
  if (missing) {
    const id = missing[1];
    return (
      `Sui has no object ${id.slice(0, 8)}…${id.slice(-4)}${where}. This almost always means the app's settings point at different networks ` +
      `(for example a mainnet registry with a testnet relayer). The operator should check MEMWAL_REGISTRY_ID, MEMWAL_SERVER_URL and NEXT_PUBLIC_SUI_NETWORK.`
    );
  }

  const enoki = /Enoki API failed \(status: (\d+)\)/.exec(raw);
  if (enoki) {
    return (
      `Enoki refused the request (${enoki[1]}). This is a setting on the Enoki side, not something you did wrong: ` +
      `the most common cause is that the API key does not have ${network ?? "this network"} enabled.`
    );
  }

  if (/Failed to open popup/i.test(raw)) return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
  if (/Popup closed/i.test(raw)) return "The sign-in window was closed before it finished. Try again and leave it open until it closes itself.";
  if (/No valid gas coins/i.test(raw)) return "The transaction needed gas and none was sponsored. Wait a moment and try again; if it keeps happening the operator's sponsorship is misconfigured.";
  if (/user rejected|rejected the request|declined/i.test(raw)) return "The request was declined in your wallet, so nothing was changed.";
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(raw)) return "Could not reach the server. Check your connection and try again.";
  if (/InsufficientGas|insufficient gas/i.test(raw)) return "The transaction ran out of gas. Try again; if it keeps happening the operator's gas sponsorship needs attention.";

  return raw;
}
