import { markInner, type MarkVariant } from "@/lib/brand-mark";

/**
 * The Fuuud mark, drawn once in lib/brand-mark.ts. The markup is a static string built
 * from constants in that file (no user input), so injecting it is safe. Explicit width and
 * height keep it from shifting the layout while it paints.
 */
export default function Mark({ size = 26, variant, title }: { size?: number; variant?: MarkVariant; title?: string }) {
  const v: MarkVariant = variant ?? (size <= 24 ? "small" : "full");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className="shrink-0"
      dangerouslySetInnerHTML={{ __html: markInner(v) }}
    />
  );
}
