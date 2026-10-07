import "server-only";
import { fetchAccountIdForOwner, grpcFor } from "./account-lookup.ts";
import { inspectCached } from "./chain-config.ts";
import { keysMatch } from "./ed25519.ts";
import { currentScope, type MemwalCreds } from "./memwal-scope.ts";
import { verifyDelegate } from "./memwal-verify.ts";
import { healthNs } from "./namespaces.ts";
import { devMockCreds, devMockEnabled } from "./oauth/dev.ts";

const HEX64 = /^[0-9a-fA-F]{64}$/;

export type Intake =
  | { ok: true; creds: MemwalCreds; publicKey: string }
  | { ok: false; status: number; error: string; message: string };

const fail = (status: number, error: string, message: string): Intake => ({ ok: false, status, error, message });

/**
 * A delegate key handed to the server so a non-browser surface (a connected AI app,
 * the Telegram bot) can act for the signed-in person. Checked three ways before it is
 * trusted: the private key must derive to the public key claimed, the account is the
 * one THIS owner holds onchain (looked up, never supplied), and the key must work
 * against the relayer - a key never registered onchain fails the last check.
 *
 * `owner` must come from the session. The web app's own key is refused: each surface
 * gets its own key so it can be revoked on its own.
 */
export async function intakeDelegate(
  owner: string,
  body: { publicKey?: unknown; privateKey?: unknown; devMock?: unknown },
): Promise<Intake> {
  if (devMockEnabled() && body.devMock === true) return { ok: true, creds: devMockCreds(owner), publicKey: "dev" };

  if (typeof body.publicKey !== "string" || typeof body.privateKey !== "string" || !HEX64.test(body.publicKey) || !HEX64.test(body.privateKey)) {
    return fail(400, "invalid_request", "A connector key is required.");
  }
  if (!keysMatch(body.privateKey, body.publicKey)) return fail(400, "invalid_request", "That key pair does not match.");
  if (currentScope()?.creds?.delegatePublicKey.toLowerCase() === body.publicKey.toLowerCase()) {
    return fail(400, "invalid_request", "Create a new key for this connection.");
  }

  const checked = await inspectCached();
  if (!checked.ok) return fail(503, "server_error", checked.problem);
  let accountId: string | null;
  try {
    accountId = await fetchAccountIdForOwner(grpcFor(checked.config), checked.config.registryId, owner);
  } catch (error) {
    console.error("[fuuud] account lookup failed:", error instanceof Error ? error.message : error);
    return fail(503, "temporarily_unavailable", "Could not reach Sui. Try again.");
  }
  if (!accountId) return fail(409, "no_account", "Create your memory account first.");

  const failure = await verifyDelegate({ accountId, delegateKey: body.privateKey, namespace: healthNs(owner) });
  if (failure) return fail(400, "invalid_key", "The relayer does not accept that key yet. Wait a few seconds and try again.");

  const publicKey = body.publicKey.toLowerCase();
  return { ok: true, publicKey, creds: { accountId, delegateKey: body.privateKey, delegatePublicKey: publicKey, owner: owner.toLowerCase() } };
}
