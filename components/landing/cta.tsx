import Link from "next/link";
import { ArrowRight } from "lucide-react";
import BlurIn from "./blur-in";

export default function Cta({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  return (
    <section
      className="border-b border-line-soft"
      style={{ background: "radial-gradient(46rem 26rem at 50% 100%, var(--c-accent-wash), transparent 62%)" }}
    >
      <div className="mx-auto max-w-[1280px] px-6 py-24 text-center md:px-12">
        <BlurIn
          text="Tell it once. That's the whole product."
          className="mx-auto max-w-[20ch] font-display font-medium text-[clamp(36px,5vw,52px)] leading-[1.05] tracking-[-0.03em]"
        />

        <div className="mt-9 flex justify-center">
          <Link href={ctaHref} className="cta h-[52px] px-[26px] text-[15px]">
            {ctaLabel}
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <p className="mt-5 text-[12.5px] text-ink-faint">
          Free while in beta. Health guidance only — not a substitute for a practitioner.
        </p>
      </div>
    </section>
  );
}
