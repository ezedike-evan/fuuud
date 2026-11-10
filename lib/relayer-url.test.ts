import { test } from "node:test";
import assert from "node:assert/strict";
import { relayerUrl, TESTNET_RELAYER, MAINNET_RELAYER } from "./relayer-url.ts";

test("unset or blank falls back to the testnet relayer", () => {
  assert.equal(relayerUrl(undefined), TESTNET_RELAYER);
  assert.equal(relayerUrl("  "), TESTNET_RELAYER);
});

test("a configured relayer is used as given, minus a trailing slash", () => {
  assert.equal(relayerUrl(MAINNET_RELAYER + "/"), MAINNET_RELAYER);
  assert.equal(relayerUrl("http://localhost:8000"), "http://localhost:8000");
});

test("the retired staging host is mapped to its replacement", () => {
  assert.equal(relayerUrl("https://relayer-staging.memory.walrus.xyz"), TESTNET_RELAYER);
  assert.equal(relayerUrl("https://relayer-staging.memory.walrus.xyz/"), TESTNET_RELAYER);
});
