"use client";

import { useState, useTransition } from "react";
import { forgetFact } from "@/app/actions/memory";
import { useElapsed } from "@/lib/use-elapsed";

/**
 * Retracting a fact is one of the few irreversible-feeling things in the app,
 * so it asks twice - and the confirm state says what actually happens rather
 * than "are you sure?". Nobody can consent to a thing they have not been told.
 *
 * It is also a WRITE to Walrus (a tombstone), so it takes the same 25-35 s as
 * saving a fact. The working state says so and counts, because a button that
 * shows "…" for half a minute reads as broken.
 */
export default function ForgetButton({ claim, compact = false }: { claim: string; compact?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const seconds = useElapsed(pending);

  const size = compact ? "text-[11.5px]" : "text-[12.5px]";

  function run() {
    setError(null);
    start(async () => {
      const outcome = await forgetFact(claim).catch(() => null);
      if (!outcome) setError("Couldn't reach your memory. Nothing was changed.");
      else if (outcome.status === "not-found") setError("Couldn't find that entry to retract.");
      else if (outcome.status !== "retracted") setError("Couldn't retract.");
      // On success the server action revalidates the page and this row is gone.
      if (outcome?.status === "retracted") setArmed(false);
    });
  }

  if (pending) {
    return (
      <span role="status" aria-live="polite" className={`saving flex items-center justify-end gap-2 ${size} text-ink-muted`}>
        <span aria-hidden className="saving-dot size-[5px] shrink-0 rounded-full bg-danger" />
        <span className="font-mono tabular-nums">Retracting on Walrus… {seconds}s</span>
      </span>
    );
  }

  if (error) {
    return (
      <span className={`flex items-center justify-end gap-2.5 text-right ${size}`}>
        <span className="text-danger">{error}</span>
        <button
          type="button"
          onClick={run}
          className="text-ink-muted underline underline-offset-2 transition-colors hover:text-ink"
        >
          Try again
        </button>
      </span>
    );
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={`text-right ${size} text-ink-faint transition-colors hover:text-danger`}
      >
        Forget
      </button>
    );
  }

  return (
    <span className="flex items-center justify-end gap-2.5">
      <button type="button" onClick={run} className={`${size} text-danger transition-opacity hover:opacity-80`}>
        Retract
      </button>
      <button type="button" onClick={() => setArmed(false)} className={`${size} text-ink-faint transition-colors hover:text-ink`}>
        Keep
      </button>
    </span>
  );
}
