"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import Wordmark from "@/components/wordmark";
import ThemeToggle from "@/components/theme-toggle";

const LINKS = [
  { href: "#problem", label: "The problem" },
  { href: "#how", label: "How it works" },
  { href: "#what", label: "What it does" },
  { href: "#data", label: "Your data" },
  { href: "#faq", label: "FAQ" },
];

export default function Nav({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3.5 px-6 py-[18px] md:px-12">
        <Link href="/" className="flex items-center">
          <Wordmark />
        </Link>

        <nav className="ml-8 hidden flex-1 items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-[13.5px] text-ink-muted transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex-1 lg:hidden" />

        <ThemeToggle />

        <Link
          href={ctaHref}
          className="hidden rounded-[10px] border border-line px-4 py-2 text-[13.5px] transition-colors hover:border-ink-faint sm:inline-flex"
        >
          {ctaLabel}
        </Link>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-[10px] border border-line p-2 text-ink-muted transition-colors hover:text-ink lg:hidden"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-line-soft px-6 py-3 lg:hidden">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="py-2 text-[14px] text-ink-muted transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
