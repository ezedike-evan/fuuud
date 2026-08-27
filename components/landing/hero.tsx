import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Eyebrow from "./eyebrow";
import Reveal from "./reveal";

/**
 * The hero shows the record, not a screenshot of a chat. The point of the
 * product is that these three lines already exist before you have said
 * anything, so they are the first thing on the page.
 */
export default function Hero({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  return (
    <section
      className="border-b border-line-soft"
      style={{ background: "radial-gradient(56rem 34rem at 8% 0%, var(--c-accent-wash), transparent 60%)" }}
    >
      <div className="mx-auto grid max-w-[1280px] items-center gap-14 px-6 pb-20 pt-16 md:px-12 md:pt-24 lg:grid-cols-[1.08fr_1fr]">
        <div>
          <Eyebrow>Nutrition agent · Nigeria</Eyebrow>

          <h1 className="mt-6 max-w-[13ch] font-display font-medium text-[clamp(44px,7vw,68px)] leading-[0.98] tracking-[-0.03em]">
            Never declare your allergy <em className="italic text-accent">twice</em>.
          </h1>

          <p className="mt-7 max-w-[46ch] text-[17px] leading-[1.62] text-ink-muted">
            Tell it once that you&apos;re diabetic, or that groundnuts bring you out in hives. It
            remembers — across every session, on every screen — and suggests food people here
            actually eat.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-[18px]">
            <Link href={ctaHref} className="cta h-[52px] px-[26px] text-[15px]">
              {ctaLabel}
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="#how"
              className="inline-flex h-[52px] items-center rounded-[10px] border border-line px-[22px] text-[15px] text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
            >
              See how it works
            </a>
          </div>

          <p className="mt-5 font-mono text-[11.5px] text-ink-faint">
            No wallet. No seed phrase. Your record, your address.
          </p>
        </div>

        <Reveal delay={0.1}>
          <div className="flex flex-col gap-3.5 rounded-[10px] border border-line bg-recess p-[22px]">
            <p className="eyebrow">What it knows about you</p>

            <div className="flex flex-col gap-2">
              <div className="rounded-[10px] border border-line bg-surface px-3.5 py-3">
                <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-accent">Condition</p>
                <p className="text-[13.5px]">Type 2 diabetes</p>
              </div>
              <div className="rounded-[10px] border border-line bg-surface px-3.5 py-3">
                <p className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-danger">Allergy</p>
                <p className="text-[13.5px]">Groundnuts — hives</p>
              </div>
            </div>

            <div className="rounded-[10px] border border-accent-line bg-accent-wash px-4 py-3.5 text-sm leading-[1.6]">
              &ldquo;Boiled yam with efo riro and grilled titus. Light on the palm oil, skip the
              swallow tonight.&rdquo;
              <p className="mt-2.5 font-mono text-[10.5px] text-ink-faint">
                recalled 2 facts · never asked again
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
