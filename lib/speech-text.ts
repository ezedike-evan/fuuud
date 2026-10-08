import { toPlain } from "./telegram-text.ts";

/**
 * What gets spoken and how it is cut up. Pure, with no encoder or framework imports, so both the
 * server (Telegram voice notes) and the browser (the "Listen" button) use it.
 */

/** Groq's per-request input limit is 200; stay a little under it. */
export const TTS_CHUNK_MAX = 190;
/** Most we will ever speak for one reply. Replies are under ~110 words, so this is a ceiling, not a target. */
export const TTS_TOTAL_MAX = 1100;

/** What to say aloud: the reply without markdown, links, emoji or the save receipt. */
export function speechText(reply: string): string {
  return toPlain(reply)
    .split(/\n\s*\n(?=[⏳✓⚠])/u)[0] // the "Saving…/Saved/could not save" receipt is for the eye
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[•*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split into pieces of at most `max` characters on sentence, then clause, then word boundaries; cap the total. */
export function chunkForSpeech(text: string, max = TTS_CHUNK_MAX, total = TTS_TOTAL_MAX): string[] {
  const clipped = text.length > total ? text.slice(0, total).replace(/[^.!?]*$/, "") || text.slice(0, total) : text;
  const sentences = clipped.match(/[^.!?]+[.!?]*\s*/g) ?? [clipped];
  const out: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };
  const pushLong = (s: string) => {
    // A sentence longer than the limit: break on commas, then on spaces.
    let rest = s.trim();
    while (rest.length > max) {
      let cut = rest.lastIndexOf(",", max);
      if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
      if (cut < max / 2) cut = max;
      out.push(rest.slice(0, cut + (rest[cut] === "," ? 1 : 0)).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
  };
  for (const s of sentences) {
    if (s.length > max) {
      flush();
      pushLong(s);
    } else if ((current + s).length > max) {
      flush();
      current = s;
    } else {
      current += s;
    }
  }
  flush();
  return out.filter((c) => /[\p{L}\p{N}]/u.test(c));
}


/** The most natural installed browser voice for a neutral English reply. Pure, so it can be tested. */
export function pickVoice<T extends { name: string; lang: string; localService?: boolean; default?: boolean }>(voices: T[]): T | null {
  const english = voices.filter((v) => /^en[-_]/i.test(v.lang) || v.lang.toLowerCase() === "en");
  if (!english.length) return null;
  const rank = (v: T) => {
    const lang = v.lang.replace("_", "-").toLowerCase();
    let score = lang === "en-ng" ? 40 : lang === "en-gb" ? 30 : lang === "en-us" ? 25 : lang.startsWith("en-") ? 10 : 5;
    if (/natural|neural|premium|enhanced|online/i.test(v.name)) score += 12;
    if (/novelty|zarvox|bad news|bells|whisper|cellos|organ|trinoids|albert|bubbles|boing/i.test(v.name)) score -= 50;
    if (v.default) score += 2;
    return score;
  };
  return [...english].sort((a, b) => rank(b) - rank(a))[0];
}
