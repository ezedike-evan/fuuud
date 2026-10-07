import "server-only";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "./auth.ts";
import { credsFor } from "./memwal-cookie.ts";
import { runInScope } from "./memwal-scope.ts";

/**
 * Identity boundary. Returns a Sui address only when the browser presented a
 * session cookie this server signed, which it only mints after verifying a
 * wallet signature over a server-issued nonce (app/api/auth/verify).
 *
 * DEV_FAKE_ADDRESS bypasses all of that and is refused in production.
 */
export async function getOwnerAddress(): Promise<string | null> {
  return resolveAddress();
}

/**
 * Runs `fn` with the signed-in person's own MemWal account in scope. EVERY page, route
 * and action that reads or writes memory, or asks whether the person has an account,
 * must run inside this.
 *
 * It is a wrapper, not a side effect, on purpose. The earlier design recorded the scope
 * from inside getOwnerAddress(), but AsyncLocalStorage.enterWith() inside an awaited
 * callee does not reach its caller, so the scope was never visible: every page bounced
 * to /setup, and the memory layer would have fallen back to a shared account. `run()`
 * around the work is the form that provably holds.
 *
 * `lib/scope-guard.test.ts` fails if a new memory-touching entry point forgets it.
 */
export async function inScope<T>(fn: () => Promise<T>): Promise<T> {
  const address = await resolveAddress().catch(() => null);
  const creds = address ? await credsFor(address) : null;
  return runInScope({ creds }, fn);
}

async function resolveAddress(): Promise<string | null> {
  const dev = process.env.DEV_FAKE_ADDRESS;
  if (dev) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DEV_FAKE_ADDRESS must not be set in production");
    }
    return dev.toLowerCase();
  }
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}
