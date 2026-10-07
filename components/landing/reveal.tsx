import type { ReactNode } from "react";

/**
 * Lifts a block into place as it enters the view (CSS only, see `.km-reveal` in
 * globals.css). A server component: no JavaScript ships for it, and the content is
 * in the HTML and visible even if scripts never run.
 */
export default function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div className={`km-reveal${className ? ` ${className}` : ""}`} style={{ ["--d" as string]: `${delay}s` }}>
      {children}
    </div>
  );
}
