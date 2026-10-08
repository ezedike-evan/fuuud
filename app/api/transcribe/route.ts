import { kvIncr } from "@/lib/kv.ts";
import { getOwnerAddress } from "@/lib/session.ts";
import { MAX_AUDIO_BYTES, audioType } from "@/lib/stt.ts";
import { TranscribeError, transcribe } from "@/lib/transcribe.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PER_MINUTE = 12;

/**
 * Dictation: audio in, text out. The text goes into the message box for the person to
 * read and edit before sending, so a misheard word never reaches their health record
 * without them seeing it. Nothing is stored here.
 */
export async function POST(req: Request) {
  const owner = await getOwnerAddress();
  if (!owner) return Response.json({ error: "Sign in first." }, { status: 401 });

  const type = audioType(req.headers.get("content-type"));
  if (!type) return Response.json({ error: "That is not an audio recording." }, { status: 415 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_AUDIO_BYTES) return Response.json({ error: "That recording is too long. Keep it under a minute." }, { status: 413 });

  try {
    const minute = Math.floor(Date.now() / 60_000);
    if ((await kvIncr(`stt:${owner.toLowerCase()}:${minute}`, 120)) > PER_MINUTE) {
      return Response.json({ error: "Slow down a little and try again in a minute." }, { status: 429 });
    }
  } catch (error) {
    console.error("[fuuud] stt rate limit unavailable:", error instanceof Error ? error.message : error);
  }

  const audio = new Uint8Array(await req.arrayBuffer());
  if (!audio.byteLength) return Response.json({ error: "The recording was empty." }, { status: 400 });

  try {
    const text = await transcribe(audio, type);
    return Response.json({ text: text ?? "" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TranscribeError) {
      const status = error.code === "no-key" ? 503 : error.code === "too-large" ? 413 : error.code === "rejected" ? 502 : 503;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[fuuud] transcribe failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not transcribe that. Try again, or type it." }, { status: 500 });
  }
}
