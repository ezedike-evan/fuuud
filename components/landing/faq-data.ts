/** The landing FAQ. One source for the visible accordion and the FAQPage structured data. */
export const QA: { q: string; a: string }[] = [
  {
    q: "Is this medical advice?",
    a: "No. It does not diagnose and it is not a doctor. When a condition is involved it says so and points you to a practitioner — and the practitioner list is ranked by what it recalled, so it can be specific about who.",
  },
  {
    q: "What exactly gets written down?",
    a: "Six things you assert about yourself: a medical condition, an allergy or intolerance, an explicit “I have no allergies”, a suggestion you refused with a reason, a symptom after eating, and a standing dislike such as “I don’t like a lot of vegetables”. Cravings, small talk, hypotheticals and its own suggestions are never stored. Most turns store nothing at all.",
  },
  {
    q: "What if I say something I don't want kept?",
    a: "Say “don't save that”, or anything meaning the same, and nothing from that turn is written — including a real condition mentioned inside it. That is enforced before the write, in code, not left to the model's judgement.",
  },
  {
    q: "Can I take a fact back later?",
    a: "Yes, from the settings page or by asking. Retracting writes a record that outranks the fact, so nothing can recall it again. It is not deletion: the encrypted entry stays on Walrus until its storage period expires, and we say that everywhere rather than in a footnote.",
  },
  {
    q: "Do I need a wallet?",
    a: "No. Signing in with Google creates a Sui address for you through zkLogin. Nothing to install, no gas to pay, no seed phrase to lose — and the address is yours, not ours.",
  },
  {
    q: "What happens if this app shuts down?",
    a: "Your record is unaffected. It lives on Walrus under your address, not in our database, and any other agent you authorise can read it over MCP. That is the point of building it this way.",
  },
];
