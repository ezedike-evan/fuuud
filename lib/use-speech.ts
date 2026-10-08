"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chunkForSpeech, pickVoice, speechText } from "./speech-text";

const KEY = "fuuud:speak";

/**
 * Spoken replies with the browser's own voice (speechSynthesis). It costs nothing and sends
 * the text nowhere we run: the browser speaks it on this device. (Some browsers' built-in
 * voices are processed by the browser vendor, which is the browser's choice, not ours.)
 *
 * Off by default. The person can read aloud one reply with Listen, or turn on read-aloud for
 * every reply; the choice is remembered on this device.
 */
export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [auto, setAutoState] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    try {
      setAutoState(localStorage.getItem(KEY) === "1");
    } catch {}
    const load = () => (voice.current = pickVoice(window.speechSynthesis.getVoices()));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    runId.current++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  const speak = useCallback((id: string, markdown: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const pieces = chunkForSpeech(speechText(markdown), 220, 1400);
    if (!pieces.length) return;
    const mine = ++runId.current;
    setSpeakingId(id);
    pieces.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice.current?.lang ?? "en-GB";
      if (voice.current) u.voice = voice.current;
      u.rate = 1;
      // Each short piece ends the run or lets the next one go; a stale run never touches state.
      u.onend = () => {
        if (runId.current === mine && i === pieces.length - 1) setSpeakingId(null);
      };
      u.onerror = () => {
        if (runId.current === mine) setSpeakingId(null);
      };
      synth.speak(u);
    });
  }, []);

  const setAuto = useCallback((on: boolean) => {
    setAutoState(on);
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {}
    if (!on) stop();
  }, [stop]);

  return { supported, auto, setAuto, speakingId, speak, stop };
}
