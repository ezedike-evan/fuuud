import { cookies } from "next/headers";
import { verifyDelegate } from "@/lib/memwal-verify.ts";
import { getOwnerAddress } from "@/lib/session.ts";
import { MEMWAL_COOKIE, MEMWAL_COOKIE_OPTIONS, sealCreds } from "@/lib/memwal-cookie.ts";
import { healthNs } from "@/lib/namespaces.ts";

export const maxDuration = 60;

const HEX = /^[0-9a-fA-F]{64,128}$/;
const OBJECT_ID = /^0x[0-9a-fA-F]{64}$/;

/**
 * The browser created the account and registered the delegate key with the
 * person's own wallet; this hands the delegate key to the server so the agent
 * can act on their behalf. The owner key never reaches this route - only the
 * delegate, which the owner can revoke onchain.
 *
 * Verified before it is trusted: a signed relayer call with exactly these
 * credentials. A brand-new delegate takes a few seconds to become visible to
 * the relayer, so the check retries. This also catches a key registered on a
 * different account, which would otherwise surface as a 401 on the first chat.
 */
export async function POST(req: Request) {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });

  const body = await req.json().catch(() => null);
  const { accountId, delegateKey, delegatePublicKey, created } = body ?? {};
  if (typeof accountId !== "string" || !OBJECT_ID.test(accountId)) return new Response("accountId must be a 0x object id", { status: 400 });
  if (typeof delegateKey !== "string" || !HEX.test(delegateKey)) return new Response("delegateKey must be hex", { status: 400 });
  if (typeof delegatePublicKey !== "string" || !HEX.test(delegatePublicKey)) return new Response("delegatePublicKey must be hex", { status: 400 });

  const failure = await verifyDelegate({ accountId, delegateKey, namespace: healthNs(address) });
  if (failure) return new Response(`Relayer rejected this delegate key: ${failure}`, { status: 400 });

  (await cookies()).set(
    MEMWAL_COOKIE,
    // `freshAt` only when this setup CREATED the account; reusing an existing one must keep the restore safety net.
    sealCreds({ accountId, delegateKey, delegatePublicKey, owner: address, ...(created === true ? { freshAt: Date.now() } : {}) }),
    MEMWAL_COOKIE_OPTIONS,
  );
  return Response.json({ ok: true });
}
