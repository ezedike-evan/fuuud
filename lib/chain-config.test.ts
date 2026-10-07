import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectChainConfig, KNOWN, type Deps } from "./chain-config.ts";

const TESTNET_PKG = "0x0a625e2db2af6f591a4c80a3d8551ddf11656089cc3a20c5e9e7f8fb75b9265c";
const MAINNET_PKG = "0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5";
const TESTNET_REG = KNOWN[TESTNET_PKG].registryId;
const MAINNET_REG = KNOWN[MAINNET_PKG].registryId;

/** A fake Sui where each network only knows its own registry. */
const deps = (over: Partial<Deps> = {}): Deps => ({
  chain: async (server) =>
    server.includes("staging")
      ? { network: "testnet", grpcUrl: "https://t", packageId: TESTNET_PKG }
      : { network: "mainnet", grpcUrl: "https://m", packageId: MAINNET_PKG },
  registry: async (chain, id) =>
    (chain.network === "testnet" && id === TESTNET_REG) || (chain.network === "mainnet" && id === MAINNET_REG)
      ? { type: `${chain.packageId}::account::AccountRegistry` }
      : null,
  ...over,
});

const STAGING = "https://relayer-staging.memory.walrus.xyz";
const PROD = "https://relayer.memory.walrus.xyz";
const problem = (r: Awaited<ReturnType<typeof inspectChainConfig>>) => (r.ok ? "" : r.problem);

test("a consistent testnet setup passes and is verified", async () => {
  const r = await inspectChainConfig({ server: STAGING, registryId: TESTNET_REG, appNetwork: "testnet" }, deps());
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.verified, true); assert.equal(r.config.network, "testnet"); }
});

test("a consistent mainnet setup passes", async () => {
  assert.equal((await inspectChainConfig({ server: PROD, registryId: MAINNET_REG, appNetwork: "mainnet" }, deps())).ok, true);
});

test("THE REPORTED CASE: testnet app and relayer with the MAINNET registry", async () => {
  const p = problem(await inspectChainConfig({ server: STAGING, registryId: MAINNET_REG, appNetwork: "testnet" }, deps()));
  assert.match(p, /does not exist on testnet/);
  assert.match(p, /That is the mainnet registry/);
  assert.ok(p.includes(TESTNET_REG), "it must say which registry to use instead");
  assert.match(p, /MEMWAL_SERVER_URL/);
});

test("the mirror case: mainnet relayer with the testnet registry", async () => {
  const p = problem(await inspectChainConfig({ server: PROD, registryId: TESTNET_REG, appNetwork: "mainnet" }, deps()));
  assert.match(p, /does not exist on mainnet/);
  assert.match(p, /That is the testnet registry/);
  assert.ok(p.includes(MAINNET_REG));
});

test("app network disagreeing with the relayer is named, with both fixes and the redeploy warning", async () => {
  const p = problem(await inspectChainConfig({ server: PROD, registryId: MAINNET_REG, appNetwork: "testnet" }, deps()));
  assert.match(p, /set to testnet/);
  assert.match(p, /relayer .* is on mainnet/);
  assert.match(p, /NEXT_PUBLIC_SUI_NETWORK=mainnet/);
  assert.ok(p.includes(STAGING), "it should name the relayer that matches the app's network");
  assert.match(p, /redeploy/);
});

test("a missing or malformed registry id says what to set", async () => {
  assert.match(problem(await inspectChainConfig({ server: STAGING, registryId: "", appNetwork: "testnet" }, deps())), /not set.*736aef/);
  assert.match(problem(await inspectChainConfig({ server: STAGING, registryId: "0x123", appNetwork: "testnet" }, deps())), /not a valid object id/);
});

test("an object that exists but is not a registry is called out", async () => {
  const d = deps({ registry: async () => ({ type: "0x2::coin::Coin<0x2::sui::SUI>" }) });
  assert.match(problem(await inspectChainConfig({ server: STAGING, registryId: TESTNET_REG, appNetwork: "testnet" }, d)), /not a MemWal account registry/);
});

test("an unreachable relayer is reported against MEMWAL_SERVER_URL", async () => {
  const d = deps({ chain: async () => { throw new Error("connect timeout"); } });
  assert.match(problem(await inspectChainConfig({ server: "https://nope.example", registryId: TESTNET_REG, appNetwork: "testnet" }, d)), /MEMWAL_SERVER_URL/);
});

test("Sui being unreachable does NOT block setup: it is not a misconfiguration", async () => {
  const d = deps({ registry: async () => { throw new Error("ETIMEDOUT"); } });
  const r = await inspectChainConfig({ server: STAGING, registryId: TESTNET_REG, appNetwork: "testnet" }, d);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.verified, false);
});

test("a blank app network defaults to testnet, never to a silent mismatch", async () => {
  assert.equal((await inspectChainConfig({ server: STAGING, registryId: TESTNET_REG, appNetwork: "" }, deps())).ok, true);
});

test("a package override is honoured", async () => {
  const r = await inspectChainConfig({ server: STAGING, registryId: TESTNET_REG, appNetwork: "testnet", packageOverride: "0xabc" }, deps());
  assert.equal(r.ok && r.config.packageId, "0xabc");
});

test("a single dropped request to the relayer is retried, not reported as misconfiguration", async () => {
  let calls = 0;
  const base = deps();
  const flaky = deps({ chain: async (s) => { if (++calls === 1) throw new Error("fetch failed"); return base.chain(s); } });
  const r = await inspectChainConfig({ server: STAGING, registryId: TESTNET_REG, appNetwork: "testnet" }, flaky);
  assert.equal(r.ok, true);
  assert.equal(calls, 2);
});

test("a relayer that stays down is still reported", async () => {
  let calls = 0;
  const down = deps({ chain: async () => { calls++; throw new Error("fetch failed"); } });
  assert.match(problem(await inspectChainConfig({ server: STAGING, registryId: TESTNET_REG, appNetwork: "testnet" }, down)), /Could not read the relayer/);
  assert.equal(calls, 2);
});
