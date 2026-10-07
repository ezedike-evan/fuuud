"use client";

import { useEffect, useState, type ReactNode } from "react";
import { onSaving } from "@/lib/save-events";

/**
 * The agent screen: chat on the left, what-it-knows on the right.
 *
 * On a desktop both are visible at once. On a phone there is no room for a 328px side rail
 * next to a conversation (the chat was squeezed to ~40px), so the two become a Chat / Memory
 * switch. Both panes stay mounted either way, so switching never loses a half-typed message
 * or an in-flight reply, and a write in progress is signalled on the Memory tab.
 */
export default function AgentPanes({ chat, rail, factCount }: { chat: ReactNode; rail: ReactNode; factCount: number }) {
  const [tab, setTab] = useState<"chat" | "memory">("chat");
  const [saving, setSaving] = useState(false);
  useEffect(() => onSaving(setSaving), []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_328px]">
      <div role="tablist" aria-label="Agent view" className="segmented mx-4 mb-2 shrink-0 text-[13.5px] sm:mx-6 lg:hidden">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "chat"}
          data-on={tab === "chat"}
          onClick={() => setTab("chat")}
          className="min-h-10 flex-1"
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "memory"}
          data-on={tab === "memory"}
          onClick={() => setTab("memory")}
          className="flex min-h-10 flex-1 items-center justify-center gap-2"
        >
          What it knows
          <span className="font-mono text-[11px] tabular-nums text-ink-faint">{factCount}</span>
          {saving && <span aria-label="saving" className="saving-dot size-[6px] rounded-full bg-accent" />}
        </button>
      </div>

      <div className={`${tab === "chat" ? "flex" : "hidden"} min-h-0 flex-1 flex-col lg:flex`}>{chat}</div>
      <div className={`${tab === "memory" ? "block" : "hidden"} min-h-0 flex-1 lg:block`}>{rail}</div>
    </div>
  );
}
