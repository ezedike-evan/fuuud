export type RailFact = {
  date: string;
  kind: "condition" | "allergy" | "clearance" | "rejection" | "symptom" | "dislike" | "fact";
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
  fact: "var(--c-ink-muted)",
};

export default function MemoryRail({ facts }: { facts: RailFact[] }) {
  const active = facts.filter((f) => !f.superseded);

  return (
    <aside className="flex flex-col gap-5 border-l border-line-soft bg-recess px-6 py-8">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">What it knows</span>
        <span className="font-mono text-[11px] text-ink-faint">{active.length}</span>
      </div>

      {facts.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-line px-3.5 py-5 text-center text-[12.5px] leading-relaxed text-ink-faint">
          Nothing yet. Tell it about a condition or an allergy and it will appear here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
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
              <p className="mt-1.5 font-mono text-[10.5px] text-ink-faint">{f.date}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex-1" />

      <div className="rounded-[10px] border border-line p-3.5">
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
