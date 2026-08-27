import { Check, Minus } from "lucide-react";
import Eyebrow from "./eyebrow";
import BlurIn from "./blur-in";

/**
 * Not a competitor table — a table about where the record lives. Every row is
 * a consequence of that one difference, which is the argument the whole
 * project is making.
 */
const ROWS: { label: string; ours: string; theirs: string }[] = [
  {
    label: "Where your conditions live",
    ours: "On Walrus, under your own address",
    theirs: "In their database, under their terms",
  },
  {
    label: "Starting a fresh session",
    ours: "It already knows",
    theirs: "You type it all again",
  },
  {
    label: "Switching to another agent",
    ours: "Same record, over MCP",
    theirs: "Start from zero",
  },
  {
    label: "What gets written down",
    ours: "Four named categories, gated in code",
    theirs: "Whatever the extractor felt like keeping",
  },
  {
    label: "Allergen screening",
    ours: "Deterministic, runs after the model",
    theirs: "The model's good intentions",
  },
  {
    label: "Two facts that disagree",
    ours: "Newer date wins, said out loud",
    theirs: "Whichever the retriever ranked first",
  },
  {
    label: "Taking a fact back",
    ours: "Retraction nothing can read past",
    theirs: "A support ticket, maybe",
  },
  {
    label: "Cutting off access",
    ours: "Revoke the key onchain, no permission asked",
    theirs: "Delete your account and hope",
  },
];

export default function Comparison() {
  return (
    <section className="border-b border-line-soft bg-recess">
      <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-12">
        <Eyebrow>The difference</Eyebrow>

        <BlurIn
          text="One change, and everything else follows from it."
          className="mt-6 max-w-[26ch] font-display font-medium text-[clamp(32px,4.4vw,44px)] leading-[1.1] tracking-[-0.03em]"
        />

        <p className="mt-5 max-w-[56ch] text-[15px] leading-[1.66] text-ink-muted">
          The record is not in our database. Every row below is a consequence of that, not a
          feature we bolted on.
        </p>

        <div className="mt-11 overflow-x-auto rounded-[10px] border border-line">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="px-5 py-3.5">
                  <span className="eyebrow">&nbsp;</span>
                </th>
                <th className="px-5 py-3.5">
                  <span className="eyebrow text-ink">Fuuud</span>
                </th>
                <th className="px-5 py-3.5">
                  <span className="eyebrow">A normal nutrition chatbot</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-b border-line-soft last:border-b-0">
                  <th scope="row" className="px-5 py-4 text-[13.5px] font-normal text-ink-muted">
                    {r.label}
                  </th>
                  <td className="px-5 py-4">
                    <span className="flex items-start gap-2.5 text-[13.5px] text-ink">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      {r.ours}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="flex items-start gap-2.5 text-[13.5px] text-ink-faint">
                      <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {r.theirs}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
