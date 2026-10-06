"use client";

import { useEffect, useState } from "react";

/** Whole seconds since `active` last turned true; 0 while inactive. */
export function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}

/**
 * What a Walrus write is doing at this point, from its age. These are the real
 * stages, not a progress bar: the relayer does not report byte-level progress,
 * so a percentage would be invented. Timings are the measured ones (a write is
 * 25-35 s; the upload and onchain certification take most of it).
 */
export function walrusStage(seconds: number): string {
  if (seconds < 3) return "Encrypting";
  if (seconds < 20) return "Uploading to Walrus";
  if (seconds < 40) return "Certifying onchain";
  return "Still working — the network is slow";
}
