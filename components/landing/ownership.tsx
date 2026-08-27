import { RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import Eyebrow from "./eyebrow";
import BlurIn from "./blur-in";
import Reveal from "./reveal";

/**
 * The limits panel is deliberately the same size and weight as the two claims
 * above it. Burying what a health app cannot do is how people end up trusting
 * it for the thing it was never able to do.
 */
export default function Ownership() {
  return (
    <section id="data" className="border-b border-line-soft bg-recess">
      <div className="mx-auto grid max-w-[1280px] items-center gap-14 px-6 py-20 md:px-12 lg:grid-cols-2">
        <div>
          <Eyebrow>Your data</Eyebrow>

          <BlurIn
            text="We're a guest in your record, not its keeper."
            className="mt-6 max-w-[18ch] font-display font-medium text-[clamp(32px,4.4vw,44px)] leading-[1.1] tracking-[-0.03em]"
          />

          <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.66] text-ink-muted">
            Your memory belongs to your address, encrypted with keys only you hold. This app holds
            a delegate key you granted — and one button takes it back. We can&apos;t refuse,
            because the permission was never ours.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Reveal>
            <div className="card flex gap-3.5 p-5">
              <ShieldCheck className="mt-px size-[19px] shrink-0 text-accent" aria-hidden />
              <div>
                <h3 className="mb-1.5 text-[15px] font-medium">Encrypted end to end</h3>
                <p className="text-[13px] leading-normal text-ink-muted">
                  Nobody running this service can read your conditions.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.07}>
            <div className="card flex gap-3.5 p-5">
              <RotateCcw className="mt-px size-[19px] shrink-0 text-accent" aria-hidden />
              <div>
                <h3 className="mb-1.5 text-[15px] font-medium">Revocable in one tap</h3>
                <p className="text-[13px] leading-normal text-ink-muted">
                  Enforced onchain, not by our good behaviour. Revocation is forward-only, so it
                  closes off everything saved from that moment on.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.14}>
            <div
              className="flex gap-3.5 rounded-[10px] border border-warn-line p-5"
              style={{ background: "color-mix(in oklab, var(--c-warn) 5%, transparent)" }}
            >
              <TriangleAlert className="mt-px size-[19px] shrink-0 text-warn" aria-hidden />
              <div>
                <h3 className="mb-1.5 text-[15px] font-medium">What we can&apos;t do yet</h3>
                <p className="text-[13px] leading-normal text-ink-muted">
                  Nothing deletes. Retracting a fact puts it permanently out of reach of anything
                  that reads your memory, but the encrypted entry stays on Walrus until its storage
                  period expires. We&apos;d rather say so.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
