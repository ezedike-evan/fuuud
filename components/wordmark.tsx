export default function Wordmark({ size = 26, label = true }: { size?: number; label?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-[11px]">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
        <path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z" />
        <path d="M9 7.5c0-1.6 1.2-2 1.2-3.2M14.4 7.5c0-1.6 1.2-2 1.2-3.2" />
      </svg>
      {label && (
        <span className="text-[15px] font-semibold tracking-[-0.015em]">Kitchen Memory</span>
      )}
    </span>
  );
}
