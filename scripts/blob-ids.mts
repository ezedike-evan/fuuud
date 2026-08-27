/**
 * Print the Walrus blob id behind every stored memory, for the submission's
 * explorer link.
 *
 * The MemWalAccount object on Sui does NOT hold memories — its Move package
 * has one module, `account`, and no memory type at all. The account is the
 * authority record: owner plus delegate keys. The memory itself is a
 * Seal-encrypted Walrus blob, and the blob's Seal envelope names the MemWal
 * package and the account owner, which is what ties the two together.
 *
 *   pnpm blobs 0xYOUR_SIGNED_IN_ADDRESS
 */
import { createMemWal } from "../lib/memwal-client.ts";
import { healthNs, feedbackNs } from "../lib/namespaces.ts";

const address = process.argv[2];
if (!address) {
  console.error("usage: pnpm blobs <sui-address>   (the address you sign in as)");
  process.exit(1);
}

const WALRUSCAN = (blobId: string) => `https://walruscan.com/mainnet/blob/${blobId}`;

for (const ns of [healthNs(address), feedbackNs(address)]) {
  const memwal = createMemWal(ns);
  // The relayer aborts a recall at 15s and the timeout is intermittent, so
  // give it a few goes rather than reporting an empty namespace as empty.
  let results: { text: string; blob_id: string }[] | null = null;
  for (let attempt = 1; attempt <= 4 && !results; attempt++) {
    try {
      const r = await memwal.recall({ query: "everything stored", namespace: ns, limit: 25 });
      results = r.results;
    } catch (error) {
      console.error(`  ${ns}: attempt ${attempt} failed (${error instanceof Error ? error.name : error})`);
    }
  }

  console.log(`\n${ns}`);
  if (!results) { console.log("  could not read this namespace"); continue; }
  if (!results.length) { console.log("  (nothing stored)"); continue; }
  for (const r of results) {
    console.log(`  ${r.text}`);
    console.log(`    ${WALRUSCAN(r.blob_id)}`);
  }
}
