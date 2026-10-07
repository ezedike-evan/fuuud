import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mac, macValid, open, seal } from "./seal.ts";

const A = "a".repeat(40);
const B = "b".repeat(40);

beforeEach(() => {
  process.env.OAUTH_SECRET = A;
  delete process.env.OAUTH_SECRET_PREVIOUS;
});

test("round trip", () => {
  assert.deepEqual(open("p", seal("p", { a: 1, b: ["x"] })), { a: 1, b: ["x"] });
});

test("a different purpose cannot open it (token confusion)", () => {
  const sealed = seal("oauth-client-id", { n: "x" });
  assert.equal(open("pending-authorize", sealed), null);
  assert.equal(open("grant-creds", sealed), null);
});

test("tampering with any part fails closed", () => {
  const sealed = seal("p", { a: 1 });
  const parts = sealed.split(".");
  for (let i = 0; i < 4; i++) {
    const copy = [...parts];
    copy[i] = copy[i].slice(0, -2) + (copy[i].endsWith("AA") ? "BB" : "AA");
    assert.equal(open("p", copy.join(".")), null, `part ${i}`);
  }
  assert.equal(open("p", "garbage"), null);
  assert.equal(open("p", ""), null);
  assert.equal(open("p", null), null);
});

test("expiry is enforced", async () => {
  const sealed = seal("p", { a: 1 }, 5);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(open("p", sealed), null);
});

test("rotation: the previous secret still opens old artifacts, the new one seals", () => {
  const old = seal("p", { n: 1 });
  process.env.OAUTH_SECRET = B;
  assert.equal(open("p", old), null, "unknown key without the previous secret");
  process.env.OAUTH_SECRET_PREVIOUS = A;
  assert.deepEqual(open("p", old), { n: 1 });
  const fresh = seal("p", { n: 2 });
  delete process.env.OAUTH_SECRET_PREVIOUS;
  assert.deepEqual(open("p", fresh), { n: 2 });
});

test("a short secret is refused", () => {
  process.env.OAUTH_SECRET = "too short";
  assert.throws(() => seal("p", {}), /at least 32/);
});

test("HMACs are purpose-separated and survive rotation", () => {
  const tag = mac("access-token", "gid.123");
  assert.equal(macValid("access-token", "gid.123", tag), true);
  assert.equal(macValid("access-token", "gid.124", tag), false);
  assert.equal(macValid("other-purpose", "gid.123", tag), false);
  process.env.OAUTH_SECRET = B;
  assert.equal(macValid("access-token", "gid.123", tag), false);
  process.env.OAUTH_SECRET_PREVIOUS = A;
  assert.equal(macValid("access-token", "gid.123", tag), true);
});
