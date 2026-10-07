import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import Wordmark from "@/components/wordmark";

export default function Footer() {
  return (
    <footer className="bg-recess">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-6 pb-11 pt-14 md:grid-cols-[1.25fr_1fr_1fr_1fr] md:px-12">
        <div>
          <div className="flex items-center gap-3">
            <Wordmark size={30} label={false} />
            <p className="font-display font-medium text-[30px] tracking-[-0.03em]">Fuuud</p>
          </div>

          <p className="mt-[18px] max-w-[34ch] text-sm leading-[1.62] text-ink-muted">
            A nutrition agent that remembers your health profile — and a record that stays yours,
            not ours.
          </p>

          <p className="mt-[22px] inline-flex items-center gap-2.5 rounded-full border border-line py-2 pl-[11px] pr-3.5">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            <span className="font-mono text-[11px] text-ink-muted">Beta · Awka, Anambra</span>
          </p>
        </div>

        <nav className="flex flex-col gap-3">
          <p className="eyebrow mb-1">Product</p>
          <Link href="/#how" className="text-[13.5px] text-ink-muted hover:text-ink">How it works</Link>
          <Link href="/#what" className="text-[13.5px] text-ink-muted hover:text-ink">What it does</Link>
          <Link href="/consultants" className="text-[13.5px] text-ink-muted hover:text-ink">Practitioners</Link>
          <Link href="/signin" className="text-[13.5px] text-ink-muted hover:text-ink">Sign in</Link>
        </nav>

        <nav className="flex flex-col gap-3">
          <p className="eyebrow mb-1">Your data</p>
          <Link href="/#data" className="text-[13.5px] text-ink-muted hover:text-ink">What we store</Link>
          <Link href="/#faq" className="text-[13.5px] text-ink-muted hover:text-ink">Retracting a fact</Link>
          <Link href="/settings" className="text-[13.5px] text-ink-muted hover:text-ink">Revoking access</Link>
          <Link href="/settings" className="text-[13.5px] text-ink-muted hover:text-ink">What it remembers</Link>
        </nav>

        <nav aria-label="Guides and legal" className="flex flex-col gap-3">
          <p className="eyebrow mb-1">Learn</p>
          <Link href="/guides/allergy-safe-nigerian-meals" className="text-[13.5px] text-ink-muted hover:text-ink">Allergy-safe Nigerian meals</Link>
          <Link href="/guides/private-health-memory" className="text-[13.5px] text-ink-muted hover:text-ink">How your memory stays private</Link>
          <Link href="/guides/connect-claude-chatgpt-cursor" className="text-[13.5px] text-ink-muted hover:text-ink">Connect your AI app</Link>
          <Link href="/privacy" className="text-[13.5px] text-ink-muted hover:text-ink">Privacy policy</Link>
          <Link href="/terms" className="text-[13.5px] text-ink-muted hover:text-ink">Terms of use</Link>
        </nav>
      </div>

      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-[22px] border-t border-line-soft px-6 pb-[22px] pt-5 md:px-12">
        <span className="font-mono text-[11px] text-ink-faint">© 2026 Fuuud</span>
        <span aria-hidden className="h-3 w-px bg-line" />
        <span className="font-mono text-[11px] text-ink-faint">Built on Walrus Memory</span>
        <div className="flex-1" />
        <span className="flex items-center gap-2">
          <ShieldCheck aria-hidden className="size-[13px] text-ink-faint" />
          <span className="font-mono text-[11px] text-ink-faint">
            Encrypted to your address · never to ours
          </span>
        </span>
      </div>
    </footer>
  );
}
