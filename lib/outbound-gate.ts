/**
 * Nothing leaves the app - a Telegram reminder, a calendar event - unless it
 * passes the same deterministic screen the chat reply does, against the record
 * as it stands NOW. An outbound tool call is a write into someone's life that
 * cannot be recalled, so it is held to the stricter standard, not a looser one.
 *
 * Pure: no I/O, no SDK. The caller supplies the profile.
 */
import { screenReply, type HealthProfile } from "./safety.ts";

export type Gated =
  | { ok: true; text: string }
  | { ok: false; reason: string; flags: string[] };

export function gateOutbound(text: string, profile: HealthProfile): Gated {
  const { safe, allergenFlags, conditionFlags, observanceFlags } = screenReply(text, profile);
  if (safe) return { ok: true, text };
  const flags = [...allergenFlags, ...conditionFlags, ...observanceFlags];
  return { ok: false, reason: `blocked: clashes with your record (${flags.join(", ")})`, flags };
}
