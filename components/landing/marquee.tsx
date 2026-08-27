/**
 * A slow band of the things this agent is actually screening for. It is not
 * decoration for its own sake — it is the vocabulary, in the words people use
 * here, which is half the argument that the app was built for somewhere
 * specific. Stops entirely under `prefers-reduced-motion` (see globals.css).
 */
const WORDS = [
  "groundnuts",
  "kuli kuli",
  "semovita",
  "garden egg",
  "palm oil",
  "type 2 diabetes",
  "ulcer",
  "hypertension",
  "malt drink",
  "akara",
  "moi moi",
  "efo riro",
  "shellfish",
  "lactose",
  "ofada",
  "egusi",
];

export default function Marquee() {
  return (
    <div className="km-marquee overflow-hidden border-t border-line-soft bg-recess py-3.5">
      <div className="km-marquee-track">
        {[0, 1].map((copy) => (
          <div key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center">
            {WORDS.map((w) => (
              <span key={`${copy}-${w}`} className="flex items-center">
                <span className="whitespace-nowrap font-mono text-[11.5px] uppercase tracking-[0.11em] text-ink-faint">
                  {w}
                </span>
                <span aria-hidden className="mx-6 size-1 bg-line" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
