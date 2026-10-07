/**
 * Why Enoki sign-in can fail BEFORE the person ever sees Google.
 *
 * Enoki's wallet opens a blank popup first and only then asks the Enoki API for a
 * login nonce. If that request is refused, the popup just stays blank and the
 * real reason is a console error nobody reads. This turns Enoki's refusal into a
 * sentence the operator can act on, shown on the sign-in page itself.
 */

export type Preflight = { ok: true } | { ok: false; problem: string };

/** Pure so it can be tested without the network. `body` is Enoki's raw response text. */
export function interpretEnokiResponse(status: number, body: string, network: string): Preflight {
  if (status >= 200 && status < 300) return { ok: true };

  let code = "";
  try {
    code = (JSON.parse(body) as { errors?: { code?: string }[] }).errors?.[0]?.code ?? "";
  } catch {
    /* not JSON */
  }

  if (code === "missing_networks") {
    return {
      ok: false,
      problem:
        `Your Enoki API key does not have ${network} enabled. Open the Enoki portal, edit the key, enable ${network} ` +
        `(or create a ${network} key), then set NEXT_PUBLIC_ENOKI_API_KEY and redeploy. Until then Enoki refuses every sign-in and the popup stays blank.`,
    };
  }
  if (status === 401 || code === "unauthorized" || code === "invalid_api_key") {
    return { ok: false, problem: "Enoki rejected NEXT_PUBLIC_ENOKI_API_KEY as invalid. Copy the PUBLIC key for this app from the Enoki portal." };
  }
  if (status === 403) {
    return { ok: false, problem: `Enoki refused this API key${code ? ` (${code})` : ""}. Check the key's allowed origins and networks in the Enoki portal.` };
  }
  if (status === 429) return { ok: false, problem: "Enoki is rate limiting this key. Wait a minute and try again." };
  return { ok: false, problem: `Enoki answered ${status}${code ? ` (${code})` : ""}. Sign-in may not work until that is resolved.` };
}
