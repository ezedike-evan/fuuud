import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { chunkForSpeech, encodeMp3, joinPcm, parseWav, speechText, synthesizeMp3, TTS_CHUNK_MAX, type Pcm } from "./tts.ts";

function wav(samples: Int16Array, sampleRate = 24000, dataSizeField?: number): Uint8Array {
  const data = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  const out = new Uint8Array(44 + data.length);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + data.length, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, dataSizeField ?? data.length, true); out.set(data, 44);
  return out;
}
const tone = (n: number) => Int16Array.from({ length: n }, (_, i) => Math.round(Math.sin(i / 8) * 8000));

test("speechText drops markdown, links, emoji and the save receipt", () => {
  const out = speechText("Got it — **no groundnut**, as you told me. See https://x.test/a now.\n\n⏳ Saving 1 fact to Walrus…");
  assert.equal(out, "Got it — no groundnut, as you told me. See now.");
});

test("chunks respect the 200-character limit and lose no words", () => {
  const text = "Try boiled yam with efo riro. " + "It is light on the palm oil, and it keeps you full for hours without the heavy swallow, which is useful tonight. ".repeat(4) + "Enjoy!";
  const chunks = chunkForSpeech(text);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((c) => c.length <= TTS_CHUNK_MAX), JSON.stringify(chunks.map((c) => c.length)));
  assert.equal(chunks.join(" ").replace(/\s+/g, " ").split(" ").length, text.replace(/\s+/g, " ").trim().split(" ").length);
});

test("a single run-on sentence is still broken up, and nothing speakable is dropped", () => {
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
  const chunks = chunkForSpeech(long);
  assert.ok(chunks.every((c) => c.length <= TTS_CHUNK_MAX));
  assert.equal(chunks.join(" "), long);
});

test("total speech is capped", () => {
  const text = "A short sentence here. ".repeat(200);
  assert.ok(chunkForSpeech(text).join(" ").length <= 1100);
});

test("parseWav reads samples, tolerates a streaming length of 0, and rejects other formats", () => {
  const pcm = parseWav(wav(tone(100)));
  assert.equal(pcm.sampleRate, 24000);
  assert.equal(pcm.samples.length, 100);
  assert.equal(parseWav(wav(tone(50), 24000, 0)).samples.length, 50);
  assert.equal(parseWav(wav(tone(50), 24000, 0xffffffff)).samples.length, 50);
  assert.throws(() => parseWav(new Uint8Array(20)), /not a WAV/);
});

test("joinPcm inserts a pause and refuses mixed formats", () => {
  const a: Pcm = { sampleRate: 1000, channels: 1, samples: new Int16Array(10).fill(1) };
  const b: Pcm = { sampleRate: 1000, channels: 1, samples: new Int16Array(10).fill(2) };
  assert.equal(joinPcm([a, b], 100).samples.length, 10 + 100 + 10);
  assert.throws(() => joinPcm([a, { ...b, sampleRate: 2000 }]), /differ/);
});

test("encodeMp3 produces MP3 frames", () => {
  const mp3 = encodeMp3({ sampleRate: 24000, channels: 1, samples: tone(24000) });
  assert.ok(mp3.length > 500);
  assert.equal(mp3[0], 0xff);
  assert.equal(mp3[1] & 0xe0, 0xe0, "frame sync");
});

test("synthesizeMp3 talks to the speech API per chunk, in order, and returns one MP3", async () => {
  const seen: { auth?: string; body: { model: string; voice: string; input: string; response_format: string } }[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      seen.push({ auth: req.headers.authorization, body });
      res.setHeader("content-type", "audio/wav");
      res.end(Buffer.from(wav(tone(2400 + body.input.length * 10))));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  try {
    const reply = "Try boiled yam with efo riro tonight. It is light on the palm oil. " + "Skip the swallow, since you are watching your sugar and you told me so. ".repeat(3);
    const mp3 = await synthesizeMp3(reply, { apiKey: "k", base: `http://127.0.0.1:${port}/v1` });
    assert.ok(mp3 && mp3.length > 500);
    assert.ok(seen.length >= 2);
    assert.ok(seen.every((s) => s.auth === "Bearer k" && s.body.response_format === "wav" && s.body.input.length <= TTS_CHUNK_MAX));
    assert.equal(seen[0].body.model, "canopylabs/orpheus-v1-english");
    assert.equal(await synthesizeMp3("⏳ 🙂", { apiKey: "k", base: `http://127.0.0.1:${port}/v1` }), null, "nothing speakable");
  } finally {
    server.close();
  }
});

test("a refused key surfaces as a typed error", async () => {
  const server = http.createServer((_, res) => { res.statusCode = 401; res.end("{}"); });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  try {
    await assert.rejects(synthesizeMp3("Hello there.", { apiKey: "bad", base: `http://127.0.0.1:${port}/v1` }), { name: "SpeechError", code: "rejected" });
  } finally {
    server.close();
  }
});

import { pickVoice } from "./speech-text.ts";

test("pickVoice prefers a natural neutral English voice and avoids novelty voices", () => {
  const voices = [
    { name: "Zarvox", lang: "en-US" },
    { name: "Samantha", lang: "en-US" },
    { name: "Google UK English Female", lang: "en-GB" },
    { name: "Microsoft Libby Online (Natural)", lang: "en-GB" },
    { name: "Amélie", lang: "fr-CA" },
  ];
  assert.equal(pickVoice(voices)?.name, "Microsoft Libby Online (Natural)");
  assert.equal(pickVoice([{ name: "Amélie", lang: "fr-CA" }]), null);
  assert.equal(pickVoice([{ name: "Eze", lang: "en-NG" }, { name: "Sam", lang: "en-US" }])?.name, "Eze");
});
