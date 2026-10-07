"use server";

import { revalidatePath } from "next/cache";
import { getOwnerAddress, inScope } from "@/lib/session.ts";
import {
  rememberFact,
  forgetFact as retract,
  recallSafety,
  recallPreferences,
  resolveConflicts,
  type FactKind,
} from "@/lib/memory-contract.ts";

async function requireAddress() {
  const address = await getOwnerAddress();
  if (!address) throw new Error("Not signed in");
  return address;
}

export async function saveFact(kind: FactKind, text: string, userTurn?: string) {
  // The person's own memory account must be in scope for everything below (see inScope).
  return inScope(async () => {
    const address = await requireAddress();
    return rememberFact(address, kind, text, { userTurn });
  });
}

/** Everything currently stored about this user, conflicts already resolved. */
export async function listMemory() {
  // The person's own memory account must be in scope for everything below (see inScope).
  return inScope(async () => {
    const address = await requireAddress();
    const [health, feedback] = await Promise.all([
      // Stable queries: the settings ledger must list EVERYTHING stored, and a
      // hand-written query only ever surfaces the kinds it happens to name.
      recallSafety(address),
      recallPreferences(address),
    ]);
    return {
      health: resolveConflicts(health),
      feedback: resolveConflicts(feedback),
    };
  });
}

/**
 * Retracts a fact so nothing can recall it again.
 *
 * This used to call `memwal.forget({ blobId, namespace })`, which does not
 * exist. There is no delete anywhere in the SDK — only `MemWalMock` has a
 * `forget(blobId)`, so this path worked offline and would have thrown the
 * first time anyone pressed the button against the live relayer. It now writes
 * a tombstone that outranks the claim (see lib/facts.ts).
 *
 * It is not deletion and the copy must never call it that: the encrypted entry
 * stays on Walrus, under keys only the owner holds, until its storage period
 * expires.
 */
export async function forgetFact(fact: string) {
  // The person's own memory account must be in scope for everything below (see inScope).
  return inScope(async () => {
    const address = await requireAddress();
    const outcome = await retract(address, fact);
    revalidatePath("/settings");
    revalidatePath("/agent");
    return outcome;
  });
}
