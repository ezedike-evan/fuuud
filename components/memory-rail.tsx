import { blobExplorerUrl } from "@/lib/walrus-links";
import ForgetButton from "./forget-button";
import MemoryUnavailable from "./memory-unavailable";
import type { MemoryFailure } from "@/lib/memory-errors";
import SavingRow from "./saving-row";

export type RailFact = {
  date: string;
  /** Walrus blob holding this entry. Absent only for a fact read from a mock. */
  blobId?: string;
  kind: "condition" | "allergy" | "clearance" | "rejection" | "symptom" | "dislike" | "preference" | "goal" | "observance" | "household" | "practical" | "fact";
  claim: string;
  superseded?: boolean;
};

/**
 * The rail is the differentiating move: a chatbot has no reason to show what it
 * knows about you, a memory agent has every reason.
 */
const DOT: Record<string, string> = {
  condition: "var(--c-accent)",
  allergy: "var(--c-danger)",
  // A clearance is good news, not a hazard — it must not read as an allergy.
  clearance: "var(--c-accent)",
  rejection: "var(--c-ink-muted)",
  symptom: "var(--c-warn)",
  dislike: "var(--c-ink-muted)",
  preference: "var(--c-accent)",
  observance: "var(--c-danger)",
  household: "var(--c-ink-muted)",
  practical: "var(--c-ink-muted)",
  goal: "var(--c-accent)",
  fact: "var(--c-ink-muted)",
};

export default function MemoryRail({ facts, unavailable }: { facts: RailFact[]; unavailable?: MemoryFailure }) {
  const active = facts.filter((f) => !f.superseded);

  return (
    /*
      The rail is fixed to the height of its column. The heading and the footer
      note stay put; only the list of facts scrolls, so a person with thirty
      stored facts sees the same layout as one with three.
    */
    <aside className="flex h-full min-h-0 flex-col gap-5 overflow-hidden bg-recess px-4 py-5 sm:px-6 lg:border-l lg:border-line-soft lg:py-8">
      <div className="flex shrink-0 items-baseline justify-between">
        <span className="eyebrow">What it knows</span>
        <span className="font-mono text-[11px] text-ink-faint">{active.length}</span>
      </div>

      <ul className="scroll-quiet -mr-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2">
        <SavingRow />
        {unavailable && (
          <li><MemoryUnavailable failure={unavailable} compact /></li>
        )}
        {!unavailable && facts.length === 0 && (
          <li className="rounded-[10px] border border-dashed border-line px-3.5 py-5 text-center text-[12.5px] leading-relaxed text-ink-faint">
            Nothing yet. Tell it about a condition, an allergy, something you like or a budget, and it will appear here.
          </li>
        )}
          {facts.map((f, i) => (
            <li
              key={`${f.date}-${f.claim}-${i}`}
              className={`rounded-[10px] border px-3 py-2.5 ${
                f.superseded
                  ? "border-line bg-surface opacity-55"
                  : "border-line bg-surface"
              }`}
            >
              <div className="mb-1.5 flex items-center gap-[7px]">
                <span aria-hidden className="size-[5px] rounded-full" style={{ background: DOT[f.kind] ?? DOT.fact }} />
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.07em]"
                  style={{ color: f.superseded ? "var(--c-warn)" : DOT[f.kind] ?? DOT.fact }}
                >
                  {f.superseded ? "Superseded" : f.kind}
                </span>
              </div>
              <p className={`text-[13.5px] leading-snug ${f.superseded ? "text-ink-muted line-through" : "text-ink"}`}>
                {f.claim}
              </p>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="font-mono text-[10.5px] text-ink-faint">{f.date}</span>
                {!f.superseded && <ForgetButton claim={f.claim} compact />}
                {/*
                  The entry, on Walrus, for anyone to check. The ciphertext is
                  public and unreadable without the keys — which is exactly what
                  makes it worth linking: you can verify it exists without
                  being able to read it.
                */}
                {f.blobId && (
                  <a
                    href={blobExplorerUrl(f.blobId)}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={`Walrus blob ${f.blobId}`}
                    className="font-mono text-[10px] text-ink-faint underline underline-offset-2 transition-colors hover:text-accent"
                  >
                    blob ↗
                  </a>
                )}
              </div>
            </li>
          ))}
      </ul>

      {/* The list above owns the free space now, so no spacer is needed and
          this note is pinned to the bottom of the rail. */}
      <div className="shrink-0 rounded-[10px] border border-line p-3.5">
        <div className="mb-1.5 flex items-center gap-[7px]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted">
            <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3Z" />
          </svg>
          <span className="text-xs text-ink-muted">You own this memory</span>
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-faint">
          Encrypted to your own address. This app is a delegate you can revoke.
        </p>
      </div>
    </aside>
  );
}
