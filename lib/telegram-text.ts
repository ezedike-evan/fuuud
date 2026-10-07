/** Pure helpers for Telegram messages (no server imports, so they are unit-tested). */

export const TELEGRAM_LIMIT = 4096;

/** `/cmd@botname rest` -> { cmd: "cmd", arg: "rest" }; plain text -> null. */
export function parseCommand(text: string): { cmd: string; arg: string } | null {
  const m = /^\/([A-Za-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  return m ? { cmd: m[1].toLowerCase(), arg: (m[2] ?? "").trim() } : null;
}

/** Telegram renders plain text here: drop the markdown the model writes instead of showing literal asterisks. */
export function toPlain(markdown: string): string {
  return markdown
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\s][^*\n]*?)\*(?!\*)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

/** Split on paragraph, then line, then space boundaries so no message exceeds Telegram's limit. */
export function splitMessage(text: string, limit = TELEGRAM_LIMIT - 96): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/* ------------------------------ the memory card ------------------------------ */

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SECTIONS: { kinds: string[]; title: string }[] = [
  { kinds: ["allergy"], title: "🚫 Allergies" },
  { kinds: ["condition"], title: "🩺 Conditions" },
  { kinds: ["clearance"], title: "✅ Cleared" },
  { kinds: ["observance"], title: "🕊 Fasting and faith" },
  { kinds: ["dislike", "rejection"], title: "👎 Dislikes" },
  { kinds: ["preference"], title: "👍 Likes" },
  { kinds: ["goal"], title: "🎯 Goals" },
  { kinds: ["symptom"], title: "🤒 After eating" },
  { kinds: ["household"], title: "🏠 Household" },
  { kinds: ["practical"], title: "🍳 Kitchen and budget" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-10-07` -> `7 Oct 2026`; anything else is returned as it came. */
function niceDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : iso;
}

/** Stored lines (`date | kind | claim`) as a grouped Telegram HTML card. Everything from memory is escaped. */
export function formatMemory(lines: string[]): string {
  const facts = lines.map((line) => {
    const [date = "", kind = "", ...rest] = line.split("|").map((p) => p.trim());
    const claim = (rest.join(" | ") || line).split(" - SUPERSEDES:")[0].trim();
    return { date, kind: kind.toLowerCase(), claim };
  });
  if (!facts.length) return "I do not know anything about you yet.\n\nTell me about any allergies or conditions and I will remember them.";

  const known = new Set(SECTIONS.flatMap((s) => s.kinds));
  const sections = SECTIONS.map((s) => ({ title: s.title, items: facts.filter((f) => s.kinds.includes(f.kind)) }));
  const other = facts.filter((f) => !known.has(f.kind));
  if (other.length) sections.push({ title: "📝 Other", items: other });

  const body = sections
    .filter((s) => s.items.length)
    .map((s) => `<b>${s.title}</b>\n${s.items.map((f) => `• ${escapeHtml(f.claim)}${f.date ? ` <i>(${escapeHtml(niceDate(f.date))})</i>` : ""}`).join("\n")}`)
    .join("\n\n");

  return `<b>What I know about you</b>\n\n${body}\n\n<i>Forget or correct anything in Settings on the website.</i>`;
}
