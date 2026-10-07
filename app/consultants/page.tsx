import { redirect } from "next/navigation";
import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { requireAccount } from "@/lib/require-account.ts";
import { recallHealth, resolveConflicts, claimsOfKind } from "@/lib/memory-contract.ts";
import { rankConsultants } from "@/lib/consultants.ts";
import AppShell from "@/components/app-shell";

export const dynamic = "force-dynamic";

async function ConsultantsPageInner() {
  const address = await getOwnerAddress();
  if (!address) redirect("/signin");
  requireAccount();

  const facts = resolveConflicts(await recallHealth(address, "medical conditions").catch(() => [])).active;
  const ranked = rankConsultants(claimsOfKind(facts, "condition"));
  const anyMatch = ranked.some((c) => c.score > 0);

  return (
    <AppShell address={address} active="/consultants">
      <div className="mx-auto w-full max-w-4xl px-14 py-10">
        <h1 className="font-display font-medium text-[40px] leading-[1.05] tracking-[-0.03em]">Practitioners</h1>
        <p className="mt-2.5 max-w-[60ch] text-[14.5px] leading-relaxed text-ink-muted">
          {anyMatch
            ? "Ranked from what your agent remembers — not from a search box you filled in. Revoke its access and this list goes flat."
            : "Unranked. Your agent has no stored conditions yet, or its access to them was revoked."}
        </p>

        <ol className="mt-8 flex flex-col gap-3">
          {ranked.map((c, i) => (
            <li
              key={c.slug}
              className={`flex items-stretch gap-5 rounded-[10px] border px-6 py-[22px] ${
                c.score > 0 ? "border-accent-line bg-accent-wash" : "border-line bg-surface"
              }`}
            >
              <div className="flex w-11 shrink-0 flex-col items-center gap-2.5">
                <span className={`font-mono text-[22px] tabular-nums ${c.score > 0 ? "text-accent" : "text-ink-faint"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span aria-hidden className="w-px flex-1 bg-line" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display font-medium text-[25px] tracking-[-0.02em]">{c.name}</span>
                  <span className="text-[12.5px] text-ink-faint">{c.role}</span>
                </div>
                <p className={`mt-2.5 text-[13.5px] ${c.score > 0 ? "text-ink-muted" : "text-ink-faint"}`}>
                  {c.reason}
                </p>
              </div>

              <div className="flex items-center">
                <span
                  className={`rounded-[8px] px-[17px] py-[9px] text-[13.5px] ${
                    c.score > 0 ? "cta" : "border border-line text-ink-muted"
                  }`}
                >
                  Book
                </span>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-6 flex items-start gap-3 rounded-[10px] border border-dashed border-line px-5 py-4 text-[12.5px] leading-relaxed text-ink-faint">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0">
            <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3Z" />
            <path d="M9.4 12l1.9 1.9 3.6-3.6" />
          </svg>
          Your conditions were never sent to these practitioners. Ranking happens on your side, from memory you own.
        </p>
      </div>
    </AppShell>
  );
}

// Wrapped so the person's memory account is in scope for everything above (see inScope).
export default function ConsultantsPage() {
  return inScope(ConsultantsPageInner);
}
