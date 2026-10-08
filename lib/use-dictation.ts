"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_AUDIO_SECONDS } from "./stt";

export type DictationState = "idle" | "recording" | "transcribing";

const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

const pickType = () => (typeof MediaRecorder === "undefined" ? undefined : TYPES.find((t) => MediaRecorder.isTypeSupported(t)));

/**
 * Press to record, press again to stop; the recording is transcribed on the server and
 * handed to `onText`. Nothing is sent until the person stops, and the text lands in the
 * message box, not in the conversation, so they can fix a misheard word first.
 */
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setSupported(typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(pickType()));
  }, []);

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => () => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    release();
  }, [release]);

  const send = useCallback(async (blob: Blob) => {
    setState("transcribing");
    try {
      const res = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": blob.type || "audio/webm" }, body: blob });
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not transcribe that. Try again, or type it.");
      if (body.text?.trim()) onTextRef.current(body.text.trim());
      else setError("I did not catch anything. Try again a little closer to the mic.");
    } catch (e) {
      setError(e instanceof TypeError ? "No connection. Try again, or type it." : e instanceof Error ? e.message : "Could not transcribe that.");
    } finally {
      setState("idle");
    }
  }, []);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    cancelled.current = false;
    const mimeType = pickType();
    if (!mimeType) return setError("This browser cannot record audio. Type it instead.");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      return setError(denied ? "Microphone access is blocked. Allow it in the browser's site settings, then try again." : "No microphone was found.");
    }

    chunks.current = [];
    const rec = new MediaRecorder(stream.current, { mimeType });
    recorder.current = rec;
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      release();
      const blob = new Blob(chunks.current, { type: rec.mimeType || mimeType });
      chunks.current = [];
      if (cancelled.current) return setState("idle");
      if (blob.size < 1200) {
        setState("idle");
        return setError("That was too short. Hold on a little longer.");
      }
      void send(blob);
    };
    rec.start();
    setSeconds(0);
    setState("recording");
    const began = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= MAX_AUDIO_SECONDS - 5) stop();
    }, 250);
  }, [release, send, stop]);

  return { state, seconds, error, supported, start, stop, clearError: () => setError(null) };
}
