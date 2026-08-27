"use client";

import { useState, useTransition } from "react";
import { forgetFact } from "@/app/actions/memory";

/**
 * Retracting a fact is one of the few irreversible-feeling things in the app,
 * so it asks twice — and the confirm state says what actually happens rather
 * than "are you sure?". Nobody can consent to a thing they have not been told.
 */
export default function ForgetButton({ claim }: { claim: string }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (error) {
    return <span className="text-right text-[12.5px] text-danger">{error}</span>;
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-right text-[12.5px] text-ink-faint transition-colors hover:text-danger"
      >
        Forget
      </button>
    );
  }

  return (
    <span className="flex items-center justify-end gap-2.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const outcome = await forgetFact(claim).catch(() => null);
            if (!outcome || outcome.status !== "retracted") {
              setError("Couldn't retract");
            }
          })
        }
        className="text-[12.5px] text-danger transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {pending ? "…" : "Retract"}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-[12.5px] text-ink-faint transition-colors hover:text-ink"
      >
        Keep
      </button>
    </span>
  );
}
