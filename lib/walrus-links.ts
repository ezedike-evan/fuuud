/**
 * Where a stored memory can be seen for real.
 *
 * Every fact the agent writes ends up as one Seal-encrypted blob on Walrus.
 * The blob id comes back on every recall, so the record is inspectable by
 * anyone the person shows it to — and the ciphertext is public, which is the
 * point: you can verify the entry exists without being able to read it.
 */

const WALRUSCAN = "https://walruscan.com/mainnet/blob";
const AGGREGATOR = "https://aggregator.walrus-mainnet.walrus.space/v1/blobs";

/** The blob on Walruscan — what it is, who stored it, when it expires. */
export const blobExplorerUrl = (blobId: string) => `${WALRUSCAN}/${encodeURIComponent(blobId)}`;

/** The raw ciphertext, straight from a Walrus aggregator. */
export const blobRawUrl = (blobId: string) => `${AGGREGATOR}/${encodeURIComponent(blobId)}`;
