import { KeyRound, MessageSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn.ts";
import Eyebrow from "./eyebrow";
import BlurIn from "./blur-in";
import Reveal from "./reveal";

/*
 * Three steps, each shown with the record it leaves behind. It used to be one scroll-jacked
 * panel (300vh tall) that revealed a step at a time, which hid steps 2 and 3 from anything
 * that does not scroll, and pinned phone screens for three screens of height. Now every
 * step and its record is in the page, in order, alternating sides.
 */
const STEPS = [
  {
    n: "01",
    icon: KeyRound,
    title: "Sign in with Google",
    body:
      "A Sui address is created for you behind the scenes. No wallet to install, no gas to pay, nothing to write down.",
    meta: ["zkLogin via Enoki", "address owned by you"],
    record: [
      { k: "account", v: "0x7f3a…c21e" },
      { k: "delegate", v: "granted to this app" },
      { k: "record", v: "empty — nobody has asked yet" },
    ],
  },
  {
    n: "02",
    icon: MessageSquare,
    title: "Talk to it like a person",
    body:
      "It writes down conditions, allergies, and foods that disagreed with you. It ignores cravings and small talk — and stops entirely if you say “don’t save that”.",
    meta: ["encrypted before it leaves", "stored on Walrus"],
    record: [
      { k: "condition", v: "type 2 diabetes" },
      { k: "allergy", v: "groundnuts — hives" },
      { k: "not stored", v: "“I fancy jollof tonight”" },
    ],
  },
  {
    n: "03",
    icon: Sparkles,
    title: "Everything else follows",
    body:
      "Meal suggestions, and the practitioners you’re shown, both rank off what it remembers. You never fill in a form twice.",
    meta: ["semantic recall", "newer facts win"],
    record: [
      { k: "meal", v: "boiled yam, efo riro, grilled titus" },
      { k: "screened", v: "kuli kuli blocked — groundnut" },
      { k: "consultant", v: "dietitian · cites diabetes" },
    ],
  },
];

export default function HowItWorks() {
  return (
    <section id="how" aria-label="How it works" className="border-b border-line-soft bg-recess">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-20 md:px-12 md:py-24">
        <Eyebrow>How it works</Eyebrow>

        <BlurIn
          as="h2"
          text="Three steps, then it stops asking."
          className="mt-6 max-w-[22ch] font-display font-medium text-[clamp(32px,4.4vw,44px)] leading-[1.1] tracking-[-0.03em]"
        />

        <ol className="mt-14 flex flex-col gap-14 md:gap-20">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const flip = i % 2 === 1;
            return (
              <li key={step.n}>
                <Reveal className={cn("grid items-center gap-8 lg:gap-16", flip ? "lg:grid-cols-[1.1fr_1fr]" : "lg:grid-cols-[1fr_1.1fr]")}>
                  <div className={cn(flip && "lg:order-2")}>
                    <div className="flex items-center gap-3">
                      <span className="rounded-[10px] bg-surface-hi p-2 text-accent">
                        <Icon aria-hidden className="size-[18px]" />
                      </span>
                      <p className="font-mono text-[11px] text-accent">Step {step.n}</p>
                    </div>
                    <h3 className="mt-4 font-display text-[26px] font-medium leading-[1.15] tracking-[-0.02em]">{step.title}</h3>
                    <p className="mt-3 max-w-[46ch] text-[15px] leading-[1.65] text-ink-muted">{step.body}</p>
                    <p className="mt-4 font-mono text-[11px] leading-[1.7] text-ink-faint">
                      {step.meta[0]}
                      <br />
                      {step.meta[1]}
                    </p>
                  </div>

                  <div className={cn("rounded-[10px] border border-line bg-surface p-6", flip && "lg:order-1")}>
                    <p className="eyebrow">Their record, at step {step.n}</p>
                    <dl className="mt-5 flex flex-col gap-2.5">
                      {step.record.map((r) => (
                        <div key={r.k} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[10px] border border-line-soft bg-recess px-3.5 py-3">
                          <dt className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-accent">{r.k}</dt>
                          <dd className="fact min-w-0 break-words text-ink">{r.v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
