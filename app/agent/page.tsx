import { redirect } from "next/navigation";
import { getOwnerAddress } from "@/lib/session.ts";
import { recallSafety, recallPreferences, resolveConflicts } from "@/lib/memory-contract.ts";
import AppShell from "@/components/app-shell";
import Chat from "@/components/chat";
import MemoryRail, { type RailFact } from "@/components/memory-rail";

export const dynamic = "force-dynamic";

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

export default async function AgentPage() {
  const address = await getOwnerAddress();
  if (!address) redirect("/signin");

  /*
   * One recall per page load, both namespaces in parallel — never per component.
   *
   * The STABLE queries, the same ones the chat route uses. The rail previously
   * asked for "rejected meals and symptoms", which named three of the eleven
   * fact kinds — so a dislike, a like, a goal, a budget or a household fact sat
   * in the record and never appeared here, because recall is a similarity
   * search and nothing in the query resembled them.
   */
  const [health, feedback] = await Promise.all([
    recallSafety(address).catch(() => []),
    recallPreferences(address).catch(() => []),
  ]);

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
        <Chat />
        <MemoryRail facts={facts} />
      </div>
    </AppShell>
  );
}
