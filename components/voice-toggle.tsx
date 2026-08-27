"use client";

import { useState } from "react";

/**
 * The control is designed and placed; the voice mode behind it is not built
 * yet. It says so rather than silently doing nothing — a dead button is worse
 * than an honest one.
 */
export default function VoiceToggle() {
  const [note, setNote] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setNote((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-line py-1.5 pl-[11px] pr-[13px] text-[12.5px] text-ink-muted transition-colors hover:text-ink"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M4 11v2M8 8.5v7M12 5.5v13M16 8.5v7M20 11v2" />
        </svg>
        Voice
      </button>
      {note && (
        <p
          role="status"
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-ink-muted shadow-lg"
        >
          Voice mode isn&apos;t built yet. It&apos;s next — hands are busy when you&apos;re cooking.
        </p>
      )}
    </div>
  );
}
