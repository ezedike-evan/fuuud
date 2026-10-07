/**
 * The delegate keys registered on a person's MemWal account, and what to call them.
 *
 * Why this exists: a delegate's PRIVATE key lives only in the browser (or app) that made
 * it. It is never stored on our server, so a new device or a cleared browser cannot reuse
 * the old one and must register a new key. Nothing ever removed the old ones, and the
 * contract caps an account at MAX_DELEGATE_KEYS: past that, setup fails with a Move abort
 * (ETooManyDelegateKeys). So keys need names a person can recognise, and a way to prune.
 *
 * Pure and client-safe: no imports, no `server-only`.
 */

/** From the MemWal contract (services/contract/sources/account.move). */
export const MAX_DELEGATE_KEYS = 20;
/** The contract rejects a longer label (ELabelTooLong). Measured in BYTES, not characters. */
export const MAX_LABEL_BYTES = 64;

export type DelegateKey = {
  /** Hex, lowercase: the form removeDelegateKey accepts. */
  publicKey: string;
  address: string;
  label: string;
  /** Epoch ms, or 0 if the chain did not say. */
  createdAt: number;
};

export type KeyKind = "this-browser" | "connector" | "agent" | "other";

const b64ToHex = (b64: string) => {
  try {
    return Array.from(atob(b64), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
};

/**
 * `delegate_keys` as the chain's JSON renders it:
 *   [{ public_key: "<base64>", sui_address: "0x…", label: "…", created_at: "1790745765464" }]
 * Read defensively: a contract upgrade that adds a field must not break the list, and a
 * malformed entry is skipped rather than throwing, so one bad row cannot hide the rest.
 */
export function parseDelegateKeys(raw: unknown): DelegateKey[] {
  if (!Array.isArray(raw)) return [];
  const out: DelegateKey[] = [];
  for (const entry of raw) {
    const e = entry as { public_key?: unknown; sui_address?: unknown; label?: unknown; created_at?: unknown } | null;
    if (!e || typeof e.public_key !== "string") continue;
    const publicKey = b64ToHex(e.public_key);
    if (publicKey.length !== 64) continue;
    const created = Number(e.created_at);
    out.push({
      publicKey,
      address: typeof e.sui_address === "string" ? e.sui_address : "",
      label: typeof e.label === "string" ? e.label : "",
      createdAt: Number.isFinite(created) ? created : 0,
    });
  }
  return out;
}

/** Cut a label to the contract's byte limit without splitting a multi-byte character. */
export function fitLabel(label: string, maxBytes = MAX_LABEL_BYTES): string {
  const enc = new TextEncoder();
  if (enc.encode(label).length <= maxBytes) return label;
  let out = "";
  for (const ch of label) {
    if (enc.encode(out + ch).length > maxBytes - 1) break;
    out += ch;
  }
  return `${out.trimEnd()}…`.replace(/…$/, enc.encode(out + "…").length <= maxBytes ? "…" : "");
}

function browserName(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Browser";
}

function osName(ua: string): string {
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "unknown OS";
}

/** "Fuuud web · Chrome on Android · 2026-10-07": what a person will recognise in a list of keys. */
export function deviceLabel(userAgent: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return fitLabel(`Fuuud web · ${browserName(userAgent)} on ${osName(userAgent)} · ${day}`);
}

export function classifyKey(
  key: Pick<DelegateKey, "publicKey" | "label">,
  ctx: { thisBrowser?: string | null; connectorKeys?: ReadonlySet<string> },
): KeyKind {
  if (ctx.thisBrowser && key.publicKey === ctx.thisBrowser.toLowerCase()) return "this-browser";
  if (ctx.connectorKeys?.has(key.publicKey)) return "connector";
  if (/^Fuuud MCP agent/i.test(key.label)) return "agent";
  return "other";
}
