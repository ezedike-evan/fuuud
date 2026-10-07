import crypto from "node:crypto";

/**
 * Derive an Ed25519 public key from a 32-byte seed using only node:crypto.
 *
 * The consent flow receives a delegate PRIVATE key from the browser and a public
 * key it claims belongs to it. Trusting that claim would let a client register
 * one key onchain and hand us a different, unrelated one. Recomputing the public
 * key from the seed removes the question.
 */
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function publicKeyFromSeed(seedHex: string): string | null {
  if (!/^[0-9a-fA-F]{64}$/.test(seedHex)) return null;
  try {
    const key = crypto.createPrivateKey({
      key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seedHex, "hex")]),
      format: "der",
      type: "pkcs8",
    });
    const spki = crypto.createPublicKey(key).export({ format: "der", type: "spki" });
    return spki.subarray(spki.length - 32).toString("hex");
  } catch {
    return null;
  }
}

export const keysMatch = (seedHex: string, publicKeyHex: string) =>
  publicKeyFromSeed(seedHex) === publicKeyHex.toLowerCase();
