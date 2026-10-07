import type { MemwalCreds } from "../memwal-scope.ts";

/**
 * DEVELOPMENT ONLY: lets the whole OAuth flow run against the offline mock memory,
 * with no wallet, no relayer and no gas, so it can be tested end to end.
 *
 * A grant made this way carries a placeholder account id instead of real keys.
 * It is only honoured when BOTH `DEV_FAKE_ADDRESS` is set and NODE_ENV is not
 * production; anywhere else a placeholder grant is treated as invalid, so it can
 * never reach the live relayer or be mistaken for a real credential.
 */
export const DEV_MOCK_ACCOUNT = "0xdevmock";

export const devMockEnabled = () => Boolean(process.env.DEV_FAKE_ADDRESS) && process.env.NODE_ENV !== "production";

export const isDevMockCreds = (creds: MemwalCreds) => creds.accountId === DEV_MOCK_ACCOUNT;

export function devMockCreds(owner: string): MemwalCreds {
  if (!devMockEnabled()) throw new Error("Dev mock grants are disabled outside local development.");
  return { accountId: DEV_MOCK_ACCOUNT, delegateKey: "dev", delegatePublicKey: "dev", owner: owner.toLowerCase() };
}
