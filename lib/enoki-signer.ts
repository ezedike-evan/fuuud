import type { EnokiWallet } from "@mysten/enoki";
import type { createAccount } from "@mysten-incubation/memwal/account";

// Not exported by name from the SDK; derived from the function that takes it.
type WalletSigner = NonNullable<Parameters<typeof createAccount>[0]["walletSigner"]>;

/**
 * Adapts the Enoki zkLogin wallet to the MemWal SDK's WalletSigner, so the
 * person's OWN address signs createAccount / addDelegateKey / removeDelegateKey
 * in their browser. The server never sees an owner key.
 *
 * `chain` is passed on every call: Enoki validates it and rejects undefined
 * (same reason as in components/sign-in.tsx).
 *
 * UNVERIFIED LIVE: the SDK builds the Transaction with @mysten/sui 2.x while the
 * wallet's own client is 1.33 (see the alias in package.json). Both sides go
 * through the wallet-standard `toJSON()` handoff, which is version-neutral, but
 * this path needs one real zkLogin run before it is trusted.
 */
export function enokiSigner(
  wallet: EnokiWallet,
  account: Parameters<EnokiWallet["features"]["sui:signPersonalMessage"]["signPersonalMessage"]>[0]["account"],
  chain: `sui:${string}`,
): WalletSigner {
  return {
    address: account.address,
    async signAndExecuteTransaction({ transaction }) {
      const result = await wallet.features["sui:signAndExecuteTransaction"].signAndExecuteTransaction({
        transaction,
        account,
        chain,
      });
      return { digest: result.digest };
    },
    async signPersonalMessage({ message }) {
      const { signature } = await wallet.features["sui:signPersonalMessage"].signPersonalMessage({
        message,
        account,
        chain,
      });
      return { signature };
    },
  };
}
