import Link from "next/link";
import type { Metadata } from "next";
import Wordmark from "@/components/wordmark";
import { NOINDEX } from "@/lib/seo";

export const metadata: Metadata = { title: "Page not found", ...NOINDEX };

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <Link href="/" aria-label="Fuuud home"><Wordmark /></Link>
      <p className="eyebrow">404</p>
      <h1 className="font-display text-[40px] font-medium leading-[1.05] tracking-[-0.03em] text-balance">That page is not here.</h1>
      <p className="max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
        The link may be old or mistyped. Start from the home page, or read one of the guides.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="cta rounded-[8px] px-4 py-2.5 text-[13.5px]">Go home</Link>
        <Link href="/guides" className="rounded-[8px] border border-line px-4 py-2.5 text-[13.5px] hover:bg-surface">Read the guides</Link>
      </div>
    </main>
  );
}
