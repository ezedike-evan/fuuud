/**
 * Speech-to-text helpers that need no network, so they are unit-tested.
 * The call itself is in lib/transcribe.ts.
 */

export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
/** Longest clip we accept (seconds). A food message is a sentence or two. */
export const MAX_AUDIO_SECONDS = 60;
export const STT_MODEL_DEFAULT = "whisper-large-v3-turbo";

/**
 * A vocabulary hint for the speech model. Whisper uses the prompt as context, which is the
 * difference between "jollof" and "jolly off", or "egusi" and "he goose".
 */
export const STT_PROMPT =
  "Nigerian English. Food and health talk: jollof rice, egusi, ogbono, moi moi, akara, suya, kuli-kuli, garden egg, " +
  "efo riro, ofada, pounded yam, eba, amala, fufu, pepper soup, puff-puff, chin chin, groundnut allergy, diabetes, ulcer, hypertension.";

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
};

/** `audio/webm;codecs=opus` -> `audio/webm`; anything that is not audio -> null. */
export function audioType(contentType: string | null | undefined): string | null {
  const base = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return base in EXT ? base : null;
}

/** File name with the extension the speech API sniffs from. */
export const audioFileName = (type: string) => `speech.${EXT[type] ?? "webm"}`;

/**
 * Whisper returns text for silence, and on noise it can invent a stock phrase. These are
 * the known ones; a transcript that is only one of them is treated as "heard nothing"
 * rather than being sent to the agent as if the person said it.
 */
const HALLUCINATIONS = [
  /^thanks? for watching[.!]*$/i,
  /^thank you[.!]*$/i,
  /^you[.!]*$/i,
  /^bye[.!]*$/i,
  /^please subscribe[.!]*$/i,
  /^subtitles? by .*$/i,
  /^\.+$/,
];

/** Trim, collapse whitespace, and return null when there is nothing a person said. */
export function cleanTranscript(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text || HALLUCINATIONS.some((re) => re.test(text))) return null;
  return text.slice(0, 2000);
}
