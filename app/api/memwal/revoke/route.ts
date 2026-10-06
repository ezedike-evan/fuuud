import { cookies } from "next/headers";
import { getOwnerAddress } from "@/lib/session.ts";
import { MEMWAL_COOKIE, openCreds } from "@/lib/memwal-cookie.ts";

/**
 * GET returns the PUBLIC key of the delegate this browser holds, so the page can
 * ask the person's wallet to remove it onchain. POST drops the server's copy of
 * the private key once the removal has gone through.
 *
 * Dropping the cookie is housekeeping, not revocation: the onchain removal is
 * what stops the key, and it is forward-only - memories saved before it stay
 * readable to that key until re-encrypted.
 */
export async function GET() {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  const creds = openCreds((await cookies()).get(MEMWAL_COOKIE)?.value);
  if (!creds || creds.owner !== address) return Response.json({ registered: false });
  return Response.json({ registered: true, accountId: creds.accountId, delegatePublicKey: creds.delegatePublicKey });
}

export async function POST() {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  (await cookies()).delete(MEMWAL_COOKIE);
  return Response.json({ ok: true });
}
