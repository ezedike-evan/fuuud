import crypto from "node:crypto";
import { interpretEnokiResponse } from "@/lib/enoki-preflight.ts";

export const dynamic = "force-dynamic";

/**
 * Asks Enoki for a throwaway login nonce with the same key and network the browser
 * will use. No account is created and nothing is stored; a nonce is just a number
 * Enoki hands out. The public key is public by design (it ships in the page), so
 * nothing secret is involved.
 */
export async function GET(req: Request) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_API_KEY?.trim();
  const network = process.env.NEXT_PUBLIC_SUI_NETWORK?.trim() || "testnet";
  if (!apiKey) return Response.json({ ok: false, problem: "NEXT_PUBLIC_ENOKI_API_KEY is not set on this server." });

  // A throwaway Ed25519 key, in Sui's public-key encoding (scheme flag 0 + 32 bytes).
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  const ephemeralPublicKey = Buffer.concat([Buffer.from([0]), spki.subarray(spki.length - 32)]).toString("base64");

  try {
    const res = await fetch("https://api.enoki.mystenlabs.com/v1/zklogin/nonce", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        // The origin the browser will present, so an origin allow-list is tested too.
        ...(req.headers.get("origin") ? { origin: req.headers.get("origin")! } : {}),
      },
      body: JSON.stringify({ network, ephemeralPublicKey, additionalEpochs: 1 }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return Response.json(interpretEnokiResponse(res.status, await res.text(), network), { headers: { "cache-control": "no-store" } });
  } catch {
    // Unreachable is not "misconfigured": say nothing rather than send the operator hunting.
    return Response.json({ ok: true, unverified: true }, { headers: { "cache-control": "no-store" } });
  }
}
