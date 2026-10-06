"use client";

/**
 * The chat and the memory rail are siblings with no shared parent state, and
 * the rail is a server component's output. A window event is the lightest
 * thing that lets the chat say "a write is in flight" so the rail can show a
 * placeholder card where the new fact is about to appear.
 */
const EVENT = "fuuud:saving";

export type SavingDetail = { active: boolean };

export function announceSaving(active: boolean) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<SavingDetail>(EVENT, { detail: { active } }));
}

export function onSaving(handler: (active: boolean) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<SavingDetail>).detail.active);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
