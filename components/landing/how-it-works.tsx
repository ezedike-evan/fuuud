"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "framer-motion";
import { ChevronRight, KeyRound, MessageSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn.ts";
import Eyebrow from "./eyebrow";
import BlurIn from "./blur-in";

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
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const still = useReducedMotion();

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActive(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length))));
  });

  const step = STEPS[active];

  return (
    <div
      ref={ref}
      id="how"
      className={cn("border-b border-line-soft bg-recess", !still && "relative h-[300vh]")}
    >
      <div className={cn("flex flex-col justify-center py-20", !still && "sticky top-0 min-h-screen")}>
        <div className="mx-auto w-full max-w-[1280px] px-6 md:px-12">
          <Eyebrow>How it works</Eyebrow>

          <BlurIn
            text="Three steps, then it stops asking."
            className="mt-6 max-w-[22ch] font-display font-medium text-[clamp(32px,4.4vw,44px)] leading-[1.1] tracking-[-0.03em]"
          />

          <div className="mt-11 grid items-start gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
            {/* the record, changing under the step */}
            <div className="order-2 min-h-[268px] rounded-[10px] border border-line bg-surface p-6 lg:order-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={still ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={still ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
                >
                  <p className="eyebrow">Their record, at step {step.n}</p>
                  <dl className="mt-5 flex flex-col gap-2.5">
                    {step.record.map((r) => (
                      <div
                        key={r.k}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[10px] border border-line-soft bg-recess px-3.5 py-3"
                      >
                        <dt className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-accent">{r.k}</dt>
                        <dd className="fact min-w-0 break-words text-ink">{r.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-5 font-mono text-[11px] leading-[1.7] text-ink-faint">
                    {step.meta[0]}
                    <br />
                    {step.meta[1]}
                  </p>
                </motion.div>
              </AnimatePresence>

              {!still && (
                <div className="mt-6 flex h-1 gap-2">
                  {STEPS.map((s, i) => (
                    <div key={s.n} className="h-full flex-1 overflow-hidden bg-line-soft">
                      <div
                        className={cn(
                          "h-full bg-accent transition-all duration-500",
                          i <= active ? "w-full" : "w-0",
                        )}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* the steps */}
            <ol className="order-1 flex flex-col gap-2.5 lg:order-2">
              {STEPS.map((s, i) => {
                const on = i === active;
                const Icon = s.icon;
                return (
                  <li key={s.n}>
                    <button
                      type="button"
                      onClick={() => setActive(i)}
                      aria-current={on}
                      className={cn(
                        "w-full rounded-[10px] border p-5 text-left transition-colors duration-300",
                        on ? "border-line bg-surface" : "border-transparent hover:bg-surface/60",
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 rounded-[10px] p-2 transition-colors duration-300",
                            on ? "bg-ink-strong text-canvas" : "bg-surface-hi text-ink-faint",
                          )}
                        >
                          <Icon className="size-[18px]" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="mb-1 font-mono text-[11px] text-accent">{s.n}</p>
                          <h3
                            className={cn(
                              "text-[19px] font-medium transition-colors duration-300",
                              on ? "text-ink" : "text-ink-muted",
                            )}
                          >
                            {s.title}
                          </h3>
                          {/* Without the scroll driver there is nothing to
                              reveal the collapsed bodies, so show them all. */}
                          {(on || still) && (
                            <p className="mt-2 text-sm leading-[1.6] text-ink-muted">{s.body}</p>
                          )}
                        </div>

                        <ChevronRight
                          className={cn(
                            "mt-1.5 size-[18px] shrink-0 text-ink-faint transition-opacity duration-300",
                            on ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
