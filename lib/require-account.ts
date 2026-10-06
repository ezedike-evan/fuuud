import "server-only";
import { redirect } from "next/navigation";
import { currentScope } from "./memwal-scope.ts";

/**
 * Pages that read the person's record call this right after getOwnerAddress().
 * Signed in but with no MemWal account of their own -> /setup, rather than a
 * page that renders an empty record (indistinguishable from "no allergies").
 */
export function requireAccount() {
  const scope = currentScope();
  const hasOwn = Boolean(scope?.creds);
  const shared = process.env.MEMWAL_SHARED_ACCOUNT === "1" && process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID;
  const devMock = Boolean(process.env.DEV_FAKE_ADDRESS) && process.env.NODE_ENV !== "production";
  if (!hasOwn && !shared && !devMock) redirect("/setup");
}
