import { redirect } from "next/navigation";
import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { requireAccount } from "@/lib/require-account.ts";
import { recallSafety, recallPreferences, resolveConflicts } from "@/lib/memory-contract.ts";
import AppShell from "@/components/app-shell";
import { describeMemoryFailure, type MemoryFailure } from "@/lib/memory-errors.ts";
import Chat from "@/components/chat";
import MemoryRail, { type RailFact } from "@/components/memory-rail";

export const dynamic = "force-dynamic";

// A retraction is a Walrus write (25-35 s, up to 120 s). Server actions on this
// page inherit this budget, so the platform does not kill it mid-write.
export const maxDuration = 300;

function toRail(
  facts: { text: string; blobId?: string }[],
  superseded = false,
): RailFact[] {
  return facts.map((f) => {
    const [date, kind, body] = f.text.split("|").map((p) => p.trim());
    return {
      date: date ?? "",
      kind: (kind ?? "fact") as RailFact["kind"],
      claim: (body ?? f.text).split(" - SUPERSEDES:")[0].trim(),
      // Carried through so the rail can link the actual blob on Walrus. It was
      // being dropped here, which is why the record was invisible outside the app.
      blobId: f.blobId,
      superseded,
    };
  });
}

async function AgentPageInner() {
  const address = await getOwnerAddress();
  if (!address) redirect("/signin");
  requireAccount();

  /*
   * One recall per page load, both namespaces in parallel — never per component.
   *
   * The STABLE queries, the same ones the chat route uses. The rail previously
   * asked for "rejected meals and symptoms", which named three of the eleven
   * fact kinds — so a dislike, a like, a goal, a budget or a household fact sat
   * in the record and never appeared here, because recall is a similarity
   * search and nothing in the query resembled them.
   */
  // A failed read is reported, never turned into an empty record: "nothing stored" and
  // "could not read" look identical on screen and only one of them is safe to act on.
  let health: Awaited<ReturnType<typeof recallSafety>> = [];
  let feedback: Awaited<ReturnType<typeof recallPreferences>> = [];
  let unavailable: MemoryFailure | undefined;
  try {
    [health, feedback] = await Promise.all([recallSafety(address), recallPreferences(address)]);
  } catch (error) {
    console.error("[fuuud] agent page: record unreadable:", error instanceof Error ? error.message : error);
    unavailable = describeMemoryFailure(error);
  }

  const h = resolveConflicts(health);
  const f = resolveConflicts(feedback);
  const facts = [
    ...toRail(h.active),
    ...toRail(f.active),
    ...toRail([...h.superseded, ...f.superseded], true),
  ];

  return (
    <AppShell address={address} active="/agent" fixedViewport>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_328px] overflow-hidden">
        <Chat unavailable={unavailable} />
        <MemoryRail facts={facts} unavailable={unavailable} />
      </div>
    </AppShell>
  );
}

// Wrapped so the person's memory account is in scope for everything above (see inScope).
export default function AgentPage() {
  return inScope(AgentPageInner);
}
