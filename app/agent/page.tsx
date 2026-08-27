import { redirect } from "next/navigation";
import { getOwnerAddress } from "@/lib/session.ts";
import { recallHealth, recallFeedback, resolveConflicts } from "@/lib/memory-contract.ts";
import AppShell from "@/components/app-shell";
import Chat from "@/components/chat";
import MemoryRail, { type RailFact } from "@/components/memory-rail";

export const dynamic = "force-dynamic";

function toRail(facts: { text: string }[], superseded = false): RailFact[] {
  return facts.map((f) => {
    const [date, kind, body] = f.text.split("|").map((p) => p.trim());
    return {
      date: date ?? "",
      kind: (kind ?? "fact") as RailFact["kind"],
      claim: (body ?? f.text).split(" - SUPERSEDES:")[0].trim(),
      superseded,
    };
  });
}

export default async function AgentPage() {
  const address = await getOwnerAddress();
  if (!address) redirect("/signin");

  // One recall per page load, both namespaces in parallel — never per component.
  const [health, feedback] = await Promise.all([
    recallHealth(address, "conditions, allergies and foods to avoid").catch(() => []),
    recallFeedback(address, "rejected meals and symptoms").catch(() => []),
  ]);

  const h = resolveConflicts(health);
  const f = resolveConflicts(feedback);
  const facts = [
    ...toRail(h.active),
    ...toRail(f.active),
    ...toRail([...h.superseded, ...f.superseded], true),
  ];

  return (
    <AppShell address={address} active="/agent">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_328px]">
        <Chat />
        <MemoryRail facts={facts} />
      </div>
    </AppShell>
  );
}
