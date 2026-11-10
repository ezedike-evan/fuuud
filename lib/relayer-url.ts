/**
 * The Walrus Memory relayer this deployment talks to — the one place it is read.
 *
 * No `server-only`, no `next/*`: scripts and the MCP server use it too.
 */

/** Testnet relayer. Walrus moved it from relayer-staging.memory.walrus.xyz on 2026-10-27. */
export const TESTNET_RELAYER = "https://relayer.dev.memwal.ai";
export const MAINNET_RELAYER = "https://relayer.memory.walrus.xyz";

/**
 * Hosts Walrus has retired, and where they went. The old staging host now fails TLS
 * ("no alternative certificate subject name matches"), which surfaces as a bare
 * "fetch failed" on every read and write. A deployment still configured with it
 * should keep working, and say why in the log, rather than look like an outage.
 */
const RETIRED: Record<string, string> = {
  "relayer-staging.memory.walrus.xyz": TESTNET_RELAYER,
};

let warned = false;

export function relayerUrl(raw: string | undefined = process.env.MEMWAL_SERVER_URL): string {
  const value = raw?.trim().replace(/\/$/, "") || TESTNET_RELAYER;
  let host = "";
  try {
    host = new URL(value).host;
  } catch {
    return value;
  }
  const moved = RETIRED[host];
  if (!moved) return value;
  if (!warned) {
    warned = true;
    console.warn(`[fuuud] MEMWAL_SERVER_URL ${value} is retired; using ${moved}. Update the env var.`);
  }
  return moved;
}
