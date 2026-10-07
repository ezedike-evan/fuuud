import { redirect } from "next/navigation";
import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { requireAccount } from "@/lib/require-account.ts";
import { listMemory } from "@/app/actions/memory";
import Connections from "@/components/connections";
import McpAccess from "@/components/mcp-access";
import ConnectedAgents from "@/components/connected-agents";
import KeyManager from "@/components/key-manager";
import { listConnectedApps } from "@/app/actions/connectors";
import RevokeButton from "@/components/revoke-button";
import AppShell from "@/components/app-shell";
import MemoryUnavailable from "@/components/memory-unavailable";
import { describeMemoryFailure, type MemoryFailure } from "@/lib/memory-errors.ts";
import type { RecalledFact } from "@/lib/memory-contract.ts";
import ForgetButton from "@/components/forget-button";
import { blobExplorerUrl } from "@/lib/walrus-links";

export const dynamic = "force-dynamic";

// A retraction is a Walrus write (25-35 s, up to 120 s). Server actions on this
// page inherit this budget, so the platform does not kill it mid-write.
export const maxDuration = 300;

type Row = { date: string; kind: string; claim: string; distance: number; blobId?: string };

function toRows(facts: { text: string; distance: number; blobId?: string }[]): Row[] {
  return facts.map((f) => {
    const [date, kind, body] = f.text.split("|").map((p) => p.trim());
    return {
      date: date ?? "",
      kind: kind ?? "fact",
      claim: (body ?? f.text).split(" - SUPERSEDES:")[0].trim(),
      distance: f.distance,
      blobId: f.blobId,
    };
  });
}

const KIND_COLOR: Record<string, string> = {
  condition: "var(--c-accent)",
  allergy: "var(--c-danger)",
  clearance: "var(--c-accent)",
  symptom: "var(--c-warn)",
  dislike: "var(--c-ink-muted)",
  preference: "var(--c-accent)",
  observance: "var(--c-danger)",
  household: "var(--c-ink-muted)",
  practical: "var(--c-ink-muted)",
  goal: "var(--c-accent)",
};

async function SettingsPageInner() {
  const address = await getOwnerAddress();
  if (!address) redirect("/signin");
  requireAccount();

  const empty: { active: RecalledFact[]; superseded: RecalledFact[]; retracted: RecalledFact[] } = { active: [], superseded: [], retracted: [] };
  let health = empty;
  let feedback = empty;
  let unavailable: MemoryFailure | undefined;
  try {
    ({ health, feedback } = await listMemory());
  } catch (error) {
    // Say so: an empty ledger here reads as "nothing is stored about me".
    console.error("[fuuud] settings: record unreadable:", error instanceof Error ? error.message : error);
    unavailable = describeMemoryFailure(error);
  }

  const connected = await listConnectedApps().catch(() => ({ enabled: false, apps: [], error: undefined as string | undefined }));

  const active = [...toRows(health.active), ...toRows(feedback.active)];
  const superseded = [...toRows(health.superseded), ...toRows(feedback.superseded)];
  const retracted = [...toRows(health.retracted), ...toRows(feedback.retracted)];

  return (
    <AppShell address={address} active="/settings">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-14 lg:py-10">

        <div className="flex flex-wrap items-end justify-between gap-10">
          <div>
            <h1 className="font-display font-medium text-[40px] leading-[1.05] tracking-[-0.03em]">Your memory</h1>
            <p className="mt-2.5 max-w-[58ch] text-[14.5px] leading-relaxed text-ink-muted">
              Everything the agent can recall about you, and nothing it can&apos;t. Every entry is
              dated, so a newer fact always beats an older one.
            </p>
          </div>
          <dl className="flex gap-7 pb-1">
            <div>
              <dd className="font-mono text-[25px] tabular-nums">{active.length}</dd>
              <dt className="eyebrow mt-1">Active</dt>
            </div>
            <div>
              <dd className="font-mono text-[25px] tabular-nums text-warn">{superseded.length}</dd>
              <dt className="eyebrow mt-1">Superseded</dt>
            </div>
            <div>
              <dd className="font-mono text-[25px] tabular-nums text-danger">{retracted.length}</dd>
              <dt className="eyebrow mt-1">Retracted</dt>
            </div>
          </dl>
        </div>

        {unavailable && <div className="mt-8"><MemoryUnavailable failure={unavailable} /></div>}

        {/* the ledger */}
        <div className="mt-8 overflow-hidden rounded-[10px] border border-line">
          <div className="hidden grid-cols-[104px_118px_minmax(0,1fr)_92px_78px] gap-[18px] border-b border-line bg-surface px-5 py-[11px] sm:grid">
            {["Date", "Kind", "Fact", "Distance", ""].map((h, i) => (
              <span key={i} className="eyebrow">{h}</span>
            ))}
          </div>

          {active.length === 0 && superseded.length === 0 && retracted.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-faint">
              {unavailable ? "The ledger is empty because your record could not be read, not because nothing is stored." : "Nothing stored yet. Tell the agent about a condition and it will appear here."}
            </p>
          ) : (
            <>
              {active.map((r, i) => (
                <div
                  key={`${r.date}-${r.claim}-${i}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line-soft px-4 py-3.5 sm:grid-cols-[104px_118px_minmax(0,1fr)_92px_78px] sm:gap-[18px] sm:px-5 sm:py-[15px]"
                >
                  <span className="font-mono text-[12.5px] text-ink-muted">{r.date}</span>
                  <span
                    className="justify-self-end font-mono text-[10.5px] uppercase tracking-[0.05em] sm:justify-self-start"
                    style={{ color: KIND_COLOR[r.kind] ?? "var(--c-ink-muted)" }}
                  >
                    {r.kind}
                  </span>
                  <span className="fact order-none col-span-2 min-w-0 break-words sm:col-span-1">{r.claim}</span>
                  <span className="flex items-baseline gap-2 font-mono text-xs tabular-nums text-ink-faint">
                    {r.distance.toFixed(3)}
                    {r.blobId && (
                      <a
                        href={blobExplorerUrl(r.blobId)}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={`Walrus blob ${r.blobId}`}
                        className="text-[10px] underline underline-offset-2 transition-colors hover:text-accent"
                      >
                        blob ↗
                      </a>
                    )}
                  </span>
                  <ForgetButton claim={r.claim} />
                </div>
              ))}

              {superseded.map((r, i) => (
                <div key={`s-${r.date}-${r.claim}-${i}`} className="flex items-center gap-[11px] px-5 py-3 pl-[124px]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 text-warn">
                    <path d="M7 4v9a4 4 0 0 0 4 4h7M14.5 13.5 18 17l-3.5 3.5" />
                  </svg>
                  <span className="fact text-ink-faint line-through">{r.claim}</span>
                  <span className="font-mono text-[11px] text-ink-faint">{r.date} · superseded</span>
                </div>
              ))}

              {retracted.map((r, i) => (
                <div key={`r-${r.date}-${r.claim}-${i}`} className="flex items-center gap-[11px] px-5 py-3 pl-[124px]">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 text-danger">
                    <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7M9.5 7V4.8h5V7" />
                  </svg>
                  <span className="fact text-ink-faint line-through">{r.claim}</span>
                  <span className="font-mono text-[11px] text-ink-faint">{r.date} · retracted, never read again</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Connections />

          {connected.enabled && <ConnectedAgents address={address} initial={connected.apps} error={connected.error} />}

          <KeyManager address={address} />

          <McpAccess address={address} />

          <section className="rounded-[10px] border border-warn-line px-5 py-[18px]" style={{ background: "color-mix(in oklab, var(--c-warn) 5%, transparent)" }}>
            <h2 className="mb-2.5 flex items-center gap-2.5 text-sm font-medium">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-warn">
                <path d="M12 8.5v4.5M12 16.2v.1" />
                <path d="M10.6 3.9 2.9 17.4A1.6 1.6 0 0 0 4.3 20h15.4a1.6 1.6 0 0 0 1.4-2.6L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z" />
              </svg>
              About forgetting
            </h2>
            <p className="text-[12.5px] leading-relaxed text-ink-muted">
              Forgetting writes a retraction that outranks the fact, so nothing can recall it
              again — not this app, not any agent holding your key. It is not deletion: there is
              no delete in Walrus Memory. The encrypted entry stays on Walrus, under keys only
              you hold, until its storage period expires. We won&apos;t pretend otherwise.
            </p>
          </section>

          <section className="rounded-[10px] border border-danger-line px-5 py-[18px]">
            <h2 className="mb-2.5 flex items-center gap-2.5 text-sm font-medium">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-danger">
                <path d="M18.5 12a6.5 6.5 0 1 1-2.4-5.03M18.5 4.2V8h-3.8" />
              </svg>
              Revoke app access
            </h2>
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-muted">
              Removes this app&apos;s delegate key from your account onchain, without asking the
              app. Only you can undo it. Be clear on what it does: revocation is forward-only.
              The key stops reading anything saved after you revoke it — but entries already
              saved stay readable to that key until they are re-encrypted. If you need those
              closed off too, retract them above.
            </p>
            <RevokeButton address={address} />
          </section>
        </div>
      </div>
    </AppShell>
  );
}

// Wrapped so the person's memory account is in scope for everything above (see inScope).
export default function SettingsPage() {
  return inScope(SettingsPageInner);
}
