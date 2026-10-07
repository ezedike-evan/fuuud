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
