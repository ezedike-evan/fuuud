import Link from "next/link";
import type { ReactNode } from "react";
import Nav from "@/components/landing/nav";
import Footer from "@/components/landing/footer";
import JsonLd from "@/components/json-ld";
import { absolute, articleLd, breadcrumbLd } from "@/lib/seo";
import type { PageEntry } from "@/lib/pages";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const niceDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
};

/** Site header and footer around a public content page. Static: no session lookup. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav ctaHref="/signin" ctaLabel="Sign in" />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}

/** Breadcrumb, title and standfirst, with Article and BreadcrumbList structured data. */
export function ArticleHead({
  entry,
  trail,
  eyebrow,
  heading,
  lede,
  article = true,
}: {
  entry: PageEntry;
  trail: [string, string][];
  eyebrow: string;
  heading: string;
  lede: string;
  article?: boolean;
}) {
  return (
    <header className="border-b border-line-soft" style={{ background: "radial-gradient(48rem 24rem at 6% 0%, var(--c-accent-wash), transparent 60%)" }}>
      {article && <JsonLd data={articleLd(entry)} />}
      <JsonLd data={breadcrumbLd(trail)} />
      <div className="mx-auto max-w-[1100px] px-6 pb-12 pt-12 md:px-12 md:pb-16 md:pt-16">
        <nav aria-label="Breadcrumb" className="mb-7 font-mono text-[11.5px] text-ink-faint">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li><Link href="/" className="hover:text-ink">Home</Link></li>
            {trail.map(([name, path], i) => (
              <li key={path} className="flex items-center gap-2">
                <span aria-hidden>/</span>
                {i === trail.length - 1 ? <span aria-current="page" className="text-ink-muted">{name}</span> : <Link href={path} className="hover:text-ink">{name}</Link>}
              </li>
            ))}
          </ol>
        </nav>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-4 max-w-[20ch] font-display text-[clamp(36px,6vw,58px)] font-medium leading-[1.02] tracking-[-0.03em] text-balance">{heading}</h1>
        <p className="mt-6 max-w-[58ch] text-[17px] leading-[1.65] text-ink-muted">{lede}</p>
        <p className="mt-6 font-mono text-[11.5px] text-ink-faint">Last reviewed {niceDate(entry.updated)}</p>
      </div>
    </header>
  );
}

/** A narrow-measure body column, with an optional aside that sticks on wide screens. */
export function Body({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1100px] gap-12 px-6 py-14 md:px-12 md:py-20 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">{children}</div>
      {aside && <aside className="lg:sticky lg:top-24 lg:self-start">{aside}</aside>}
    </div>
  );
}

export function Callout({ title, children, tone = "accent" }: { title: string; children: ReactNode; tone?: "accent" | "warn" }) {
  return (
    <div
      role="note"
      className="my-8 rounded-[10px] border px-5 py-4 text-[14.5px] leading-[1.65] text-ink-muted"
      style={{ borderColor: tone === "warn" ? "var(--c-warn-line)" : "var(--c-accent-line)", background: tone === "warn" ? "transparent" : "var(--c-accent-wash)" }}
    >
      <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: tone === "warn" ? "var(--c-warn)" : "var(--c-accent)" }}>{title}</p>
      {children}
    </div>
  );
}

export const MEDICAL_NOTE = (
  <Callout title="Not medical advice" tone="warn">
    <p>
      This is a reading aid, not medical advice. Recipes and ingredients differ by cook, region and brand. If you
      have a diagnosed allergy or condition, follow your clinician&apos;s guidance, read labels, and tell the person
      serving you that it is an allergy.
    </p>
  </Callout>
);

export function Related({ title = "Keep reading", links }: { title?: string; links: { href: string; label: string; hint?: string }[] }) {
  return (
    <section aria-label={title} className="border-t border-line-soft">
      <div className="mx-auto max-w-[1100px] px-6 py-14 md:px-12">
        <p className="eyebrow">{title}</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="group flex h-full flex-col gap-1 rounded-[10px] border border-line px-5 py-4 transition-colors hover:border-ink-faint hover:bg-surface">
                <span className="text-[15px] font-medium text-ink">{l.label}</span>
                {l.hint && <span className="text-[13.5px] leading-[1.55] text-ink-muted">{l.hint}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function CtaCard({ title = "Tell it once", body, label = "Start with Google" }: { title?: string; body: string; label?: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface p-5">
      <p className="font-display text-[20px] font-medium leading-[1.2] tracking-[-0.02em]">{title}</p>
      <p className="mt-2 text-[14px] leading-[1.6] text-ink-muted">{body}</p>
      <Link href="/signin" className="cta mt-4 h-[44px] w-full px-5 text-[14px]">{label}</Link>
      <p className="mt-3 font-mono text-[10.5px] text-ink-faint">No wallet. Your record, your address.</p>
    </div>
  );
}

export const publicUrl = absolute;
