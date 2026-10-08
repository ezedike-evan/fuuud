import "server-only";
import { readKeyBag } from "./keys.ts";
import { keyFor } from "./model-select.ts";
import { MAX_AUDIO_BYTES, STT_MODEL_DEFAULT, STT_PROMPT, audioFileName, cleanTranscript } from "./stt.ts";

/**
 * Speech to text through Groq's Whisper endpoint (OpenAI-compatible).
 *
 * The audio is sent to Groq to be transcribed and is not stored by us. The key is the
 * person's own Groq key if they added one in Settings, else the deployment's. Telegram
 * has no browser, so it passes `bag: null` and uses the deployment's key.
 */

const base = () => (process.env.GROQ_API_BASE?.trim() || "https://api.groq.com/openai/v1").replace(/\/$/, "");
const model = () => process.env.KM_STT_MODEL?.trim() || STT_MODEL_DEFAULT;

export class TranscribeError extends Error {
  readonly code: "no-key" | "too-large" | "unavailable" | "rejected";
  constructor(code: TranscribeError["code"], message: string) {
    super(message);
    this.name = "TranscribeError";
    this.code = code;
  }
}

export const NO_STT_KEY = "Voice needs a Groq key. Add one in Settings (the key icon), or ask whoever runs this server to set GROQ_API_KEY.";

export async function sttConfigured(): Promise<boolean> {
  return Boolean(keyFor("groq", await readKeyBag()));
}

/** Returns what was said, or null when the clip held no speech. Throws TranscribeError. */
export async function transcribe(audio: Uint8Array, type: string, opts: { useCookieKey?: boolean } = {}): Promise<string | null> {
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new TranscribeError("too-large", "That recording is too long. Keep it under a minute.");
  const bag = opts.useCookieKey === false ? { keys: {}, models: {} } : await readKeyBag();
  const apiKey = keyFor("groq", bag);
  if (!apiKey) throw new TranscribeError("no-key", NO_STT_KEY);

  const form = new FormData();
  form.set("file", new Blob([audio as BlobPart], { type }), audioFileName(type));
  form.set("model", model());
  form.set("language", "en");
  form.set("temperature", "0");
  form.set("response_format", "json");
  form.set("prompt", STT_PROMPT);

  let res: Response;
  try {
    res = await fetch(`${base()}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new TranscribeError("unavailable", "Could not reach the speech service. Try again, or type it.");
  }
  if (res.status === 401 || res.status === 403) throw new TranscribeError("rejected", "The Groq key was refused. Check it in Settings.");
  if (res.status === 429) throw new TranscribeError("unavailable", "The speech service is busy. Try again in a moment.");
  if (!res.ok) throw new TranscribeError("unavailable", "The speech service could not read that recording. Try again, or type it.");

  const body = (await res.json().catch(() => ({}))) as { text?: string };
  return cleanTranscript(body.text);
}
