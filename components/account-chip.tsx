"use client";

import { useState } from "react";

function short(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export default function AccountChip({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-[9px] rounded-full border border-line py-[5px] pl-[6px] pr-[11px] transition-colors hover:border-ink-faint"
      >
        <span
          aria-hidden
          className="size-5 rounded-full"
          style={{ background: "linear-gradient(140deg, var(--c-accent), color-mix(in oklab, var(--c-accent) 45%, #000))" }}
        />
        <span className="font-mono text-[11.5px] text-ink-muted">{short(address)}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="border-b border-line-soft px-3.5 py-3">
            <p className="eyebrow">Signed in as</p>
            <p className="mt-1.5 break-all font-mono text-[11.5px] text-ink-muted">{address}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="w-full px-3.5 py-2.5 text-left text-[13.5px] text-ink transition-colors hover:bg-surface-hi disabled:opacity-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
