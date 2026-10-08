import { test } from "node:test";
import assert from "node:assert/strict";
import { audioFileName, audioType, cleanTranscript } from "./stt.ts";

test("audioType accepts browser and Telegram recordings, rejects everything else", () => {
  assert.equal(audioType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(audioType("audio/ogg"), "audio/ogg");
  assert.equal(audioType("audio/mp4"), "audio/mp4");
  assert.equal(audioType("AUDIO/WEBM"), "audio/webm");
  assert.equal(audioType("text/html"), null);
  assert.equal(audioType("application/octet-stream"), null);
  assert.equal(audioType(null), null);
});

test("file names carry an extension the speech API recognises", () => {
  assert.equal(audioFileName("audio/webm"), "speech.webm");
  assert.equal(audioFileName("audio/ogg"), "speech.ogg");
  assert.equal(audioFileName("audio/mp4"), "speech.m4a");
});

test("transcripts are cleaned, and silence artefacts are dropped", () => {
  assert.equal(cleanTranscript("  I am   allergic\n to groundnuts "), "I am allergic to groundnuts");
  assert.equal(cleanTranscript(""), null);
  assert.equal(cleanTranscript("   "), null);
  assert.equal(cleanTranscript("Thanks for watching!"), null);
  assert.equal(cleanTranscript("you"), null);
  assert.equal(cleanTranscript("..."), null);
  assert.equal(cleanTranscript("thank you for the jollof recipe"), "thank you for the jollof recipe");
});
