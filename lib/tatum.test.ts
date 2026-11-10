import { test } from "node:test";
import assert from "node:assert/strict";
import { TATUM_GRPC_HOST, suiClientFor, suiReadProvider, tatumKey } from "./tatum.ts";

test("no key means no Tatum: reads stay on the relayer's fullnode", () => {
  assert.equal(tatumKey({}), null);
  assert.equal(tatumKey({ TATUM_API_KEY: "   " }), null);
  assert.equal(suiReadProvider({}), "fullnode");
});

test("a key routes reads through Tatum", () => {
  assert.equal(tatumKey({ TATUM_API_KEY: " t-abc " }), "t-abc");
  assert.equal(suiReadProvider({ TATUM_API_KEY: "t-abc" }), "tatum");
});

test("Tatum hosts are native gRPC host:port, one per network", () => {
  assert.equal(TATUM_GRPC_HOST.mainnet, "sui-mainnet-grpc.gateway.tatum.io:443");
  assert.equal(TATUM_GRPC_HOST.testnet, "sui-testnet-grpc.gateway.tatum.io:443");
});

test("either road yields a SuiGrpcClient on the requested network", () => {
  for (const env of [{}, { TATUM_API_KEY: "t-abc" }]) {
    const client = suiClientFor("mainnet", "https://fullnode.mainnet.sui.io:443", env);
    assert.equal(client.network, "mainnet");
    assert.equal(typeof client.getObject, "function");
  }
});
