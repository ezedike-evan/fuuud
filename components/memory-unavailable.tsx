import Link from "next/link";
import type { MemoryFailure } from "@/lib/memory-errors";

/**
 * Shown INSTEAD of an empty record whenever memory could not be read.
 *
 * For a health app an unreadable record and an empty one look the same on screen, and
 * only one of them is safe to act on. So a failed read never renders as "nothing stored":
 * it renders this, says why in plain words, and offers the way out.
 */
export default function MemoryUnavailable({ failure, compact = false }: { failure: MemoryFailure; compact?: boolean }) {
  return (
    <div role="alert" className={`rounded-[10px] border border-danger-line ${compact ? "px-3.5 py-3" : "px-5 py-4"}`}>
      <p className="eyebrow text-danger">Your memory could not be read</p>
      <p className={`mt-2 leading-relaxed text-ink-muted ${compact ? "text-[12.5px]" : "text-[13.5px]"}`}>{failure.message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {failure.needsSetup && (
          <Link href="/setup?refused=1" className="cta inline-flex h-9 items-center px-4 text-[13px]">
            Set up again
          </Link>
        )}
        {/* A plain anchor on purpose: a full reload re-runs the read from scratch. */}
        <a href="" className="text-[12.5px] text-ink-muted underline underline-offset-2 hover:text-ink">Reload</a>
      </div>
    </div>
  );
}
