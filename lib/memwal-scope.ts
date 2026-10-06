import { AsyncLocalStorage } from "node:async_hooks";

/**
 * WHOSE MEMWAL ACCOUNT THIS REQUEST SPEAKS FOR.
 *
 * Each person owns their own MemWalAccount on Sui and registers a delegate key
 * for this app. Namespaces only organise a record - they do not isolate it (any
 * delegate key on an account decrypts every namespace on it), so the boundary
 * between two people has to be the ACCOUNT, not a string prefix. A single
 * server-held key serving everyone would make "you own your memory" false.
 *
 * The credentials arrive per request (an encrypted httpOnly cookie, see
 * ./memwal-cookie) and are carried here so the memory layer, which is called
 * from a dozen places, does not need them threaded through every signature.
 *
 * No `next/*` imports: the MCP server and scripts import the memory layer too.
 */

export type MemwalCreds = {
  /** The person's MemWalAccount object id on Sui. */
  accountId: string;
  /** Delegate private key (hex) this app signs relayer requests with. */
  delegateKey: string;
  /** Matching public key (hex), kept so the person can revoke it onchain. */
  delegatePublicKey: string;
  /** The Sui address that owns the account. Must equal the session address. */
  owner: string;
};

export type MemwalScope = {
  /** null = signed in, but has not created an account yet. */
  creds: MemwalCreds | null;
};

const store = new AsyncLocalStorage<MemwalScope>();

export const currentScope = () => store.getStore();

/** Bind for the rest of the current request's async context. */
export function enterScope(scope: MemwalScope) {
  store.enterWith(scope);
}

export function runInScope<T>(scope: MemwalScope, fn: () => Promise<T>): Promise<T> {
  return store.run(scope, fn);
}

export class MemwalSetupRequired extends Error {
  readonly code = "MEMWAL_SETUP_REQUIRED";
  constructor() {
    super("No Walrus Memory account for this person yet. Create one at /setup.");
    this.name = "MemwalSetupRequired";
  }
}
