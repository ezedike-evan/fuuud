/**
 * On-chain status of a stored memory's Walrus blob.
 *
 *   pnpm blob-status 9KnjFoEGqU6CraI0dO3vYUWtOZre9KsOBQ6YaC5u95I
 *
 * Answers the question the app cannot: WHEN DOES THIS EXPIRE. Walrus storage
 * is bought in epochs, not forever — a blob is registered for a number of
 * epochs and is gone when they run out unless someone extends it. The relayer
 * chose that number on our behalf when it wrote the blob, so this is the only
 * way to find out what we actually have.
 *
 * `getVerifiedBlobStatus` talks to Walrus STORAGE NODES directly, not to Sui,
 * so it needs a network that can reach a quorum of them. It fails with "Not
 * enough statuses were retrieved to achieve quorum" from a restricted network,
 * which is a connectivity problem and not a wrong blob id.
 */
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { WalrusClient } from "@mysten/walrus";

const blobId = process.argv[2];
if (!blobId) {
  console.error("usage: pnpm blob-status <blobId>   (the id shown by `pnpm blobs`)");
  process.exit(1);
}

const sui = new SuiGrpcClient({ network: "mainnet", baseUrl: "https://fullnode.mainnet.sui.io:443" });
const walrus = new WalrusClient({ network: "mainnet", suiClient: sui });

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? String(x) : x), 2);

console.log("blob id      ", blobId);
console.log("walruscan    ", `https://walruscan.com/mainnet/blob/${blobId}`);
console.log("raw bytes    ", `https://aggregator.walrus-mainnet.walrus.space/v1/blobs/${blobId}`);

try {
  console.log("Blob type    ", await walrus.getBlobType());
} catch (error) {
  console.log("Blob type     failed:", error instanceof Error ? error.message : error);
}

try {
  const system = await walrus.systemObject();
  console.log("system object", system.id);
} catch { /* not fatal — the status below is what matters */ }

try {
  const status = await walrus.getVerifiedBlobStatus({ blobId });
  console.log("\nSTATUS\n" + json(status));
  const end = (status as { endEpoch?: number }).endEpoch;
  if (typeof end === "number") {
    // Mainnet epochs run two weeks.
    console.log(`\nExpires at Walrus epoch ${end} (~14 days per epoch).`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log("\nSTATUS unavailable:", message);
  if (message.includes("quorum")) {
    console.log("This network cannot reach enough Walrus storage nodes. Retry from an unrestricted connection.");
  }
}
