import { cookies } from "next/headers";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { readNonce, challengeText, issueSession, SESSION_COOKIE, NONCE_COOKIE } from "@/lib/auth.ts";

/**
 * Proves the caller controls the address they claim. The wallet signed a
 * server-issued nonce; we re-derive the expected message, verify the signature,
 * and only then mint a session. An address asserted by the client alone is
 * never enough — it is the key to someone's medical record.
 */
export async function POST(req: Request) {
  const { signature, address } = await req.json();
  if (typeof signature !== "string" || typeof address !== "string") {
    return new Response("signature and address required", { status: 400 });
  }

  const jar = await cookies();
  const nonce = readNonce(jar.get(NONCE_COOKIE)?.value);
  if (!nonce) return new Response("Nonce missing or expired", { status: 400 });

  const bytes = new TextEncoder().encode(challengeText(nonce));

  let signer: string;
  try {
    const publicKey = await verifyPersonalMessageSignature(bytes, signature);
    signer = publicKey.toSuiAddress();
  } catch {
    return new Response("Bad signature", { status: 401 });
  }

  if (signer.toLowerCase() !== address.toLowerCase()) {
    return new Response("Signature does not match address", { status: 401 });
  }

  jar.delete(NONCE_COOKIE);
  jar.set(SESSION_COOKIE, issueSession(signer), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 12,
  });

  return Response.json({ address: signer.toLowerCase() });
}
