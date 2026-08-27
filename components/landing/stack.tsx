import Eyebrow from "./eyebrow";
import BlurIn from "./blur-in";
import Reveal from "./reveal";

/**
 * Four pieces, and what each one is actually load-bearing for here. Naming the
 * job rather than the logo — a reader who does not know the stack should still
 * come away understanding why the record survives us.
 */
const STACK = [
  {
    name: "Sui",
    job: "Ownership",
    body: "Your account and the delegate key this app holds are objects onchain. Revoking is a transaction, not a request to us.",
  },
  {
    name: "Walrus",
    job: "Durability",
    body: "Every fact is a blob you own. The app can disappear tomorrow and the record is still there, still yours.",
  },
  {
    name: "Seal",
    job: "Encryption",
    body: "Facts are encrypted before they leave. Nobody running this service can read what you are managing.",
  },
  {
    name: "Walrus Memory",
    job: "Recall",
    body: "Search by meaning, so “what can I eat tonight?” finds the allergy you declared in different words months ago.",
  },
];

export default function Stack() {
  return (
    <section className="border-b border-line-soft">
      <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-12">
        <Eyebrow>What it runs on</Eyebrow>

        <BlurIn
          text="There is no database. Memory is the only store."
          className="mt-6 max-w-[26ch] font-display font-medium text-[clamp(32px,4.4vw,44px)] leading-[1.1] tracking-[-0.03em]"
        />

        <p className="mt-5 max-w-[56ch] text-[15px] leading-[1.66] text-ink-muted">
          Which is what lets someone clone the repo and run the whole thing with three environment
          variables — and what stops us keeping a copy of your conditions.
        </p>

        <div className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STACK.map((s, i) => (
            <Reveal key={s.name} delay={i * 0.06}>
              <div className="card h-full p-6">
                <p className="eyebrow">{s.job}</p>
                <h3 className="mb-2.5 mt-3 font-display text-[22px] font-medium tracking-[-0.02em]">
                  {s.name}
                </h3>
                <p className="text-[13.5px] leading-[1.62] text-ink-muted">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
