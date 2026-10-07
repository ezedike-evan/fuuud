import "server-only";
import { MemWal } from "@mysten-incubation/memwal";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Prove a delegate key actually works against the relayer for this account: one
 * real signed call, exactly as the app will make later.
 *
 * A brand-new delegate takes a few seconds to become visible to the relayer, so
 * this retries. It also catches a key registered on a DIFFERENT account, which
 * would otherwise surface as a 401 on the first real request.
 *
 * Returns null on success, or the last error message.
 */
export async function verifyDelegate(input: { accountId: string; delegateKey: string; namespace: string; attempts?: number }): Promise<string | null> {
  const client = MemWal.create({
    key: input.delegateKey,
    accountId: input.accountId,
    serverUrl: process.env.MEMWAL_SERVER_URL?.trim() || "https://relayer-staging.memory.walrus.xyz",
    namespace: input.namespace,
  });
  let last = "";
  try {
    for (let attempt = 0; attempt < (input.attempts ?? 6); attempt++) {
      try {
        await client.recall({ query: "conditions and allergies", limit: 1 });
        return null;
      } catch (error) {
        last = error instanceof Error ? error.message : String(error);
        await sleep(4_000);
      }
    }
    return last;
  } finally {
    client.destroy?.();
  }
}
