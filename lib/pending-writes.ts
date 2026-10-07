import { kvGet, kvSet } from "./kv.ts";

/**
 * Receipts for writes the relayer accepted but had not finished when the hosted
 * endpoint stopped waiting.
 *
 * Without these, "accepted, still saving" can turn into silent loss: a write that
 * later fails would never be mentioned again, and for an allergy that is the one
 * failure this app exists to prevent. `list_memory` shows every receipt that has
 * not completed, so a failure surfaces the next time anyone looks.
 *
 * The receipt holds the job id, namespace and KIND only - never the text of the
 * fact. Health content stays on Walrus; this store is not allowed to become a
 * second copy of it.
 */
export type Receipt = { jobId: string; namespace: string; kind: string; at: number };

const MAX_RECEIPTS = 10;
const TTL_SECONDS = 86_400;
const key = (owner: string) => `pending:${owner.toLowerCase()}`;

export const listReceipts = async (owner: string): Promise<Receipt[]> => (await kvGet<Receipt[]>(key(owner))) ?? [];

export async function recordPending(owner: string, receipt: Omit<Receipt, "at">): Promise<void> {
  const current = await listReceipts(owner);
  const next = [...current.filter((r) => r.jobId !== receipt.jobId), { ...receipt, at: Date.now() }].slice(-MAX_RECEIPTS);
  await kvSet(key(owner), next, TTL_SECONDS);
}

export async function dropReceipts(owner: string, jobIds: string[]): Promise<void> {
  if (!jobIds.length) return;
  const current = await listReceipts(owner);
  await kvSet(key(owner), current.filter((r) => !jobIds.includes(r.jobId)), TTL_SECONDS);
}
