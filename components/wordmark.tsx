import Mark from "./brand/mark";

export default function Wordmark({ size = 26, label = true }: { size?: number; label?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-[11px]">
      <Mark size={size} />
      {label && (
        <span className="text-[15px] font-semibold tracking-[-0.015em]">Fuuud</span>
      )}
    </span>
  );
}
