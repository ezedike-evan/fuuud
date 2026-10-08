import "server-only";
import { keyFor } from "./model-select.ts";
import { SpeechError, synthesizeMp3, TTS_MODEL_DEFAULT, TTS_VOICE_DEFAULT } from "./tts.ts";

/**
 * Spoken replies for Telegram, through Groq's Orpheus model with the deployment's key (Telegram
 * has no browser, so a visitor's own key is not available). The website does not call this: it
 * speaks with the browser's own voice.
 */

const groqKey = () => keyFor("groq", { keys: {}, models: {} });

export const speechConfigured = () => Boolean(groqKey());

export async function voiceReply(text: string): Promise<Uint8Array | null> {
  const apiKey = groqKey();
  if (!apiKey) throw new SpeechError("rejected", "No speech key is configured.");
  return synthesizeMp3(text, {
    apiKey,
    base: process.env.GROQ_API_BASE?.trim() || undefined,
    model: process.env.KM_TTS_MODEL?.trim() || TTS_MODEL_DEFAULT,
    voice: process.env.KM_TTS_VOICE?.trim() || TTS_VOICE_DEFAULT,
  });
}
