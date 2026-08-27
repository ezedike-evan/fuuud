"use server";

/**
 * Delegate-key registration.
 *
 * This is the piece that makes the whole submission a Walrus story rather than
 * a generic memory story: the USER owns the MemWalAccount (their Enoki zkLogin
 * address), and this app is only a delegate they registered. Revoking the
 * delegate cuts the app off from their medical record, onchain, without asking
 * the app's permission.
 *
 * Build this FIRST on the day. It is the only untested combination in the
 * stack (Enoki sponsored transaction signing an addDelegateKey call). If it
 * fights you past midday, fall back to one app-owned account with
 * namespace-per-user — you lose the revoke demo but keep everything else.
 */

import { generateDelegateKey, addDelegateKey, removeDelegateKey } from "@mysten-incubation/memwal/account";

const packageId = () => process.env.MEMWAL_PACKAGE_ID!;
const registryId = () => process.env.MEMWAL_REGISTRY_ID!;

export async function registerThisApp(accountId: string, ownerPrivateKey: string) {
  const delegate = await generateDelegateKey();

  await addDelegateKey({
    packageId: packageId(),
    registryId: registryId(),
    accountId,
    publicKey: delegate.publicKey,
    label: "Kitchen Memory",
    suiPrivateKey: ownerPrivateKey, // TODO(enoki): swap for an Enoki walletSigner + sponsored tx
  });

  // Store delegate.privateKey server-side, encrypted at rest, keyed by the
  // owner address. It must never reach the browser.
  return { suiAddress: delegate.suiAddress, privateKey: delegate.privateKey };
}

export async function revokeThisApp(accountId: string, publicKey: Uint8Array, ownerPrivateKey: string) {
  return removeDelegateKey({
    packageId: packageId(),
    registryId: registryId(),
    accountId,
    publicKey,
    suiPrivateKey: ownerPrivateKey, // TODO(enoki): Enoki walletSigner
  });
}
