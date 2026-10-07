import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_DELEGATE_KEYS, MAX_LABEL_BYTES, classifyKey, deviceLabel, fitLabel, parseDelegateKeys } from "./delegate-keys.ts";

// Two entries copied from real testnet accounts (read through GraphQL), so the parser is tested against the real shape.
const REAL = [
  { public_key: "p6Zx392zuclOVX+MyI3dimCSdlDLF8tJwoBhy3PVk5s=", sui_address: "0x0ae7e3009ad732b0382faec0220072bfe3f8511f30aa957f6dfeb0e8410811c5", label: "suihub-class-demo", created_at: "1790745765464" },
  { public_key: "I6TwkZzDofGnLt3GNJMYmynCDcPlZktZpmhms6Ajeuk=", sui_address: "0x67e6ccd644de251d4f0b42d5c0004d30c2285d4d01108503a39c6d5c5f5b367f", label: "suihub-1790747125867", created_at: "1790747126723" },
];

test("parses the real on-chain shape: base64 key to hex, string timestamp to number", () => {
  const [a, b] = parseDelegateKeys(REAL);
  assert.equal(a.publicKey, "a7a671dfddb3b9c94e557f8cc88ddd8a60927650cb17cb49c28061cb73d5939b"); // decoded independently with Buffer, not with the code under test
  assert.equal(a.publicKey.length, 64);
  assert.equal(a.label, "suihub-class-demo");
  assert.equal(a.createdAt, 1790745765464);
  assert.equal(b.address, "0x67e6ccd644de251d4f0b42d5c0004d30c2285d4d01108503a39c6d5c5f5b367f");
});

test("one malformed entry is skipped, not fatal, and extra fields are ignored", () => {
  const out = parseDelegateKeys([null, 7, { public_key: 5 }, { public_key: "not base64 !!" }, { ...REAL[0], new_field: "x" }, { public_key: "AAAA" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "suihub-class-demo");
});

test("anything that is not an array yields an empty list", () => {
  for (const v of [undefined, null, {}, "x", 3]) assert.deepEqual(parseDelegateKeys(v), []);
});

test("a missing or odd timestamp becomes 0, never NaN", () => {
  assert.equal(parseDelegateKeys([{ ...REAL[0], created_at: undefined }])[0].createdAt, 0);
  assert.equal(parseDelegateKeys([{ ...REAL[0], created_at: "soon" }])[0].createdAt, 0);
});

test("the cap is the contract's", () => {
  assert.equal(MAX_DELEGATE_KEYS, 20);
  assert.equal(MAX_LABEL_BYTES, 64);
});

test("device labels name the browser, OS and day", () => {
  const day = new Date("2026-10-07T10:00:00Z");
  const cases: Array<[string, string]> = [
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36", "Fuuud web · Chrome on Android · 2026-10-07"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "Fuuud web · Safari on iOS · 2026-10-07"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0", "Fuuud web · Firefox on Windows · 2026-10-07"],
    ["Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0", "Fuuud web · Edge on Windows · 2026-10-07"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36", "Fuuud web · Chrome on Linux · 2026-10-07"],
    ["", "Fuuud web · Browser on unknown OS · 2026-10-07"],
  ];
  for (const [ua, want] of cases) assert.equal(deviceLabel(ua, day), want, ua);
});

test("every label fits the contract's 64-BYTE limit, including multi-byte text", () => {
  const enc = new TextEncoder();
  for (const label of ["x".repeat(500), "é".repeat(100), "🍲".repeat(40), "Fuuud connector: " + "日本語".repeat(30)]) {
    const fitted = fitLabel(label);
    assert.ok(enc.encode(fitted).length <= MAX_LABEL_BYTES, `${fitted} is ${enc.encode(fitted).length} bytes`);
    assert.ok(!fitted.includes("�"), "never splits a character");
  }
  assert.equal(fitLabel("short"), "short");
  assert.ok(new TextEncoder().encode(deviceLabel("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile")).length <= MAX_LABEL_BYTES);
});

test("keys are classified so the right ones can be removed safely", () => {
  const ctx = { thisBrowser: "AA".repeat(32).toLowerCase(), connectorKeys: new Set(["bb".repeat(32)]) };
  assert.equal(classifyKey({ publicKey: "aa".repeat(32), label: "anything" }, ctx), "this-browser");
  assert.equal(classifyKey({ publicKey: "bb".repeat(32), label: "Fuuud connector: Claude" }, ctx), "connector");
  assert.equal(classifyKey({ publicKey: "cc".repeat(32), label: "Fuuud MCP agent" }, ctx), "agent");
  assert.equal(classifyKey({ publicKey: "dd".repeat(32), label: "old laptop" }, ctx), "other");
  assert.equal(classifyKey({ publicKey: "aa".repeat(32), label: "x" }, {}), "other");
});
