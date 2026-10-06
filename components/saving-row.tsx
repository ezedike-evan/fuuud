"use client";

import { useEffect, useState } from "react";
import { onSaving } from "@/lib/save-events";
import { useElapsed, walrusStage } from "@/lib/use-elapsed";

/**
 * A placeholder card at the top of the rail while a fact is being written to
 * Walrus, so the person can see the memory is on its way instead of wondering
 * whether it was heard. It disappears when the turn ends and the refreshed rail
 * shows the real entry in its place.
 */
export default function SavingRow() {
  const [active, setActive] = useState(false);
  useEffect(() => onSaving(setActive), []);
  const seconds = useElapsed(active);

  if (!active) return null;
  return (
    <li role="status" aria-live="polite" className="saving rounded-[10px] border border-dashed border-accent-line px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-[7px]">
        <span aria-hidden className="saving-dot size-[5px] rounded-full bg-accent" />
        <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-accent">Saving to Walrus</span>
      </div>
      <p className="text-[13px] leading-snug text-ink-muted">{walrusStage(seconds)}…</p>
      <p className="mt-1.5 font-mono text-[10.5px] tabular-nums text-ink-faint">{seconds}s · usually 25–35s</p>
    </li>
  );
}
