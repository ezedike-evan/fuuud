import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIco } from "./ico.ts";

test("ico header, directory and payload offsets", () => {
  const a = new Uint8Array([1, 2, 3]);
  const b = new Uint8Array([4, 5, 6, 7]);
  const ico = buildIco([{ size: 16, png: a }, { size: 256, png: b }]);
  const v = new DataView(ico.buffer);
  assert.equal(v.getUint16(2, true), 1);
  assert.equal(v.getUint16(4, true), 2);
  assert.equal(ico[6], 16);
  assert.equal(ico[22], 0, "256 is stored as 0");
  assert.equal(v.getUint32(6 + 12, true), 38);
  assert.deepEqual([...ico.slice(38, 41)], [1, 2, 3]);
  assert.deepEqual([...ico.slice(41, 45)], [4, 5, 6, 7]);
  assert.equal(ico.length, 45);
});
