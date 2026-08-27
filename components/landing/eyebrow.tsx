/**
 * The label that opens a section. A hard square rather than a dot — everything
 * on this page that names a stored fact is square-cornered, and the eyebrow is
 * the smallest instance of that rule.
 */
export default function Eyebrow({ children }: { children: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-1.5">
      <span aria-hidden className="size-2 bg-accent" />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.11em] text-ink-muted">
        {children}
      </span>
    </span>
  );
}
