import Eyebrow from "./eyebrow";
import BlurIn from "./blur-in";
import Reveal from "./reveal";

const PROBLEM = [
  {
    n: "01",
    h: "You type it again",
    p: "Diabetic. Allergic to groundnuts. Can't take too much salt. Every new chat, from the top.",
  },
  {
    n: "02",
    h: "One day you forget",
    p: "For a craving that's an annoyance. For an allergy it's a hospital visit.",
  },
  {
    n: "03",
    h: "And it isn't yours",
    p: "Whatever it did learn sits in someone else's database, on their terms.",
  },
];

export default function Problem() {
  return (
    <section id="problem" className="border-b border-line-soft">
      <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-12">
        <Eyebrow>The problem</Eyebrow>

        <BlurIn
          text="Every other food app makes you start from zero."
          className="mt-6 max-w-[24ch] font-display font-medium text-[clamp(32px,4.4vw,44px)] leading-[1.1] tracking-[-0.03em]"
        />

        <div className="mt-11 grid gap-5 md:grid-cols-3">
          {PROBLEM.map((c, i) => (
            <Reveal key={c.n} delay={i * 0.08}>
              <div className="card h-full p-6">
                <p className="font-mono text-[22px] text-accent-line">{c.n}</p>
                <h3 className="mb-2 mt-3.5 text-base font-medium">{c.h}</h3>
                <p className="text-[13.5px] leading-[1.6] text-ink-muted">{c.p}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
