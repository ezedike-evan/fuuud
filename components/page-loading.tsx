import Wordmark from "./wordmark";

/**
 * Shown the instant a signed-in page starts loading.
 *
 * These pages read the person's memory from Walrus before they can render, which takes
 * seconds (and longer on a cold start). Without this the browser shows the PREVIOUS
 * page, unchanged, until everything is ready, so a finished action looks like it did
 * nothing. A route-level loading.tsx is streamed first, so something moves at once.
 */
export default function PageLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh flex-col">
      <header className="flex items-center border-b border-line-soft px-8 py-4">
        <Wordmark size={24} />
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-14 py-10">
        <div>
          <p className="eyebrow">Loading</p>
          <p className="mt-3 text-[15px] text-ink-muted">{label}</p>
          <p className="mt-1.5 text-[12.5px] text-ink-faint">Your memory is read from Walrus, so the first load can take a few seconds.</p>
        </div>

        <div aria-hidden className="grid gap-3">
          {[72, 56, 64].map((h, i) => (
            <div key={i} className="saving rounded-[10px] border border-line-soft bg-surface" style={{ height: h, opacity: 1 - i * 0.2 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
