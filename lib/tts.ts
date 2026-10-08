import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Text to speech for Telegram voice replies, with no framework imports so it is testable.
 *
 * Groq's Orpheus model takes at most 200 characters per request and returns WAV only, while
 * Telegram plays MP3 as a voice note. So: split the reply into short sentences, synthesize each,
 * join the raw audio, and encode it to MP3 here. (The website does not use this: it speaks with
 * the browser's own voice, which costs nothing and sends no text anywhere.)
 */

export { TTS_CHUNK_MAX, TTS_TOTAL_MAX, chunkForSpeech, speechText } from "./speech-text.ts";
import { chunkForSpeech, speechText } from "./speech-text.ts";

export const TTS_MODEL_DEFAULT = "canopylabs/orpheus-v1-english";
export const TTS_VOICE_DEFAULT = "hannah";

export type Pcm = { sampleRate: number; channels: number; samples: Int16Array };

/** Reads a 16-bit PCM WAV. Walks the chunks rather than assuming a 44-byte header. */
export function parseWav(bytes: Uint8Array): Pcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");

  let offset = 12;
  let fmt: { channels: number; sampleRate: number; bits: number; format: number } | null = null;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    let size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = { format: view.getUint16(body, true), channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (id === "data") {
      if (!fmt) throw new Error("WAV data before fmt");
      if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`unsupported WAV (format ${fmt.format}, ${fmt.bits}-bit)`);
      // Streaming encoders write 0 or 0xFFFFFFFF for the length: take what is there.
      if (size === 0 || size === 0xffffffff || body + size > bytes.length) size = bytes.length - body;
      size -= size % 2;
      const copy = new Uint8Array(bytes.subarray(body, body + size)); // aligned copy
      return { sampleRate: fmt.sampleRate, channels: fmt.channels, samples: new Int16Array(copy.buffer, 0, size / 2) };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

/** Joins clips of one format, with a short pause between sentences. */
export function joinPcm(clips: Pcm[], pauseMs = 120): Pcm {
  if (!clips.length) throw new Error("nothing to join");
  const { sampleRate, channels } = clips[0];
  if (clips.some((c) => c.sampleRate !== sampleRate || c.channels !== channels)) throw new Error("clips differ in format");
  const gap = Math.round((sampleRate * pauseMs) / 1000) * channels;
  const total = clips.reduce((n, c) => n + c.samples.length, 0) + gap * (clips.length - 1);
  const samples = new Int16Array(total);
  let at = 0;
  clips.forEach((c, i) => {
    samples.set(c.samples, at);
    at += c.samples.length + (i < clips.length - 1 ? gap : 0);
  });
  return { sampleRate, channels, samples };
}

/** Mono or stereo PCM to MP3 (speech needs little: 48 kbps). */
export function encodeMp3(pcm: Pcm, kbps = 48): Uint8Array {
  if (pcm.channels !== 1 && pcm.channels !== 2) throw new Error("unsupported channel count");
  const encoder = new Mp3Encoder(pcm.channels, pcm.sampleRate, kbps);
  const block = 1152;
  const parts: Uint8Array[] = [];
  if (pcm.channels === 1) {
    for (let i = 0; i < pcm.samples.length; i += block) parts.push(encoder.encodeBuffer(pcm.samples.subarray(i, i + block)));
  } else {
    const frames = pcm.samples.length / 2;
    const left = new Int16Array(frames);
    const right = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      left[i] = pcm.samples[2 * i];
      right[i] = pcm.samples[2 * i + 1];
    }
    for (let i = 0; i < frames; i += block) parts.push(encoder.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block)));
  }
  parts.push(encoder.flush());
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export type SynthOptions = {
  apiKey: string;
  base?: string;
  model?: string;
  voice?: string;
  fetchImpl?: typeof fetch;
};

export class SpeechError extends Error {
  readonly code: "rejected" | "unavailable" | "empty";
  constructor(code: SpeechError["code"], message: string) {
    super(message);
    this.name = "SpeechError";
    this.code = code;
  }
}

/** Reply text -> MP3 bytes, or throws SpeechError. Returns null when there is nothing to say. */
export async function synthesizeMp3(reply: string, opts: SynthOptions): Promise<Uint8Array | null> {
  const chunks = chunkForSpeech(speechText(reply));
  if (!chunks.length) return null;
  const base = (opts.base ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;

  const one = async (input: string): Promise<Pcm> => {
    let res: Response;
    try {
      res = await doFetch(`${base}/audio/speech`, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: opts.model ?? TTS_MODEL_DEFAULT, voice: opts.voice ?? TTS_VOICE_DEFAULT, input, response_format: "wav" }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new SpeechError("unavailable", "Could not reach the speech service.");
    }
    if (res.status === 401 || res.status === 403) throw new SpeechError("rejected", "The speech key was refused.");
    if (!res.ok) throw new SpeechError("unavailable", `The speech service answered ${res.status}.`);
    try {
      return parseWav(new Uint8Array(await res.arrayBuffer()));
    } catch (e) {
      throw new SpeechError("unavailable", e instanceof Error ? e.message : "Unreadable audio.");
    }
  };

  // A few at a time: fast, without bursting past the provider's rate limit.
  const clips: Pcm[] = new Array(chunks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, chunks.length) }, async () => {
      while (next < chunks.length) {
        const i = next++;
        clips[i] = await one(chunks[i]);
      }
    }),
  );
  return encodeMp3(joinPcm(clips));
}
