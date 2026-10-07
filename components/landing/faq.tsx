import { Plus } from "lucide-react";
import Eyebrow from "./eyebrow";
import BlurIn from "./blur-in";
import { QA } from "./faq-data";

/**
 * Native <details> rather than a JS accordion: it opens with no hydration, it
 * is findable with the browser's own search, and it works if the bundle never
 * arrives. The only JS involved is the icon rotating.
 */


export default function Faq() {
  return (
    <section id="faq" className="border-b border-line-soft">
      <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-12">
        <Eyebrow>Questions</Eyebrow>

        <BlurIn
          text="The things worth asking a health app."
          className="mt-6 max-w-[24ch] font-display font-medium text-[clamp(32px,4.4vw,44px)] leading-[1.1] tracking-[-0.03em]"
        />

        <div className="mt-11 overflow-hidden rounded-[10px] border border-line">
          {QA.map((item) => (
            <details key={item.q} className="group border-b border-line-soft last:border-b-0">
              <summary className="flex cursor-pointer list-none items-center gap-5 px-5 py-[18px] transition-colors hover:bg-surface [&::-webkit-details-marker]:hidden">
                <span className="flex-1 text-[15px] font-medium">{item.q}</span>
                <Plus
                  aria-hidden
                  className="size-4 shrink-0 text-ink-faint transition-transform duration-300 group-open:rotate-45"
                />
              </summary>
              <p className="max-w-[70ch] px-5 pb-[22px] text-[13.5px] leading-[1.66] text-ink-muted">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
