import { cookies } from "next/headers";
import { MemWal } from "@mysten-incubation/memwal";
import { getOwnerAddress } from "@/lib/session.ts";
import { MEMWAL_COOKIE, MEMWAL_COOKIE_OPTIONS, sealCreds } from "@/lib/memwal-cookie.ts";
import { healthNs } from "@/lib/namespaces.ts";

export const maxDuration = 60;

const HEX = /^[0-9a-fA-F]{64,128}$/;
const OBJECT_ID = /^0x[0-9a-fA-F]{64}$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const { accountId, delegateKey, delegatePublicKey } = body ?? {};
  if (typeof accountId !== "string" || !OBJECT_ID.test(accountId)) return new Response("accountId must be a 0x object id", { status: 400 });
  if (typeof delegateKey !== "string" || !HEX.test(delegateKey)) return new Response("delegateKey must be hex", { status: 400 });
  if (typeof delegatePublicKey !== "string" || !HEX.test(delegatePublicKey)) return new Response("delegatePublicKey must be hex", { status: 400 });

  const client = MemWal.create({
    key: delegateKey,
    accountId,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? "https://relayer-staging.memory.walrus.xyz",
    namespace: healthNs(address),
  });

  let lastError = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await client.recall({ query: "conditions and allergies", limit: 1 });
      lastError = "";
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(4_000);
    }
  }
  client.destroy?.();
  if (lastError) return new Response(`Relayer rejected this delegate key: ${lastError}`, { status: 400 });

  (await cookies()).set(
    MEMWAL_COOKIE,
    sealCreds({ accountId, delegateKey, delegatePublicKey, owner: address }),
    MEMWAL_COOKIE_OPTIONS,
  );
  return Response.json({ ok: true });
}
