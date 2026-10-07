import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, splitMessage, toPlain, TELEGRAM_LIMIT } from "./telegram-text.ts";

test("parseCommand handles bot suffix and arguments", () => {
  assert.deepEqual(parseCommand("/memory"), { cmd: "memory", arg: "" });
  assert.deepEqual(parseCommand("/Help@FuuudBot  now"), { cmd: "help", arg: "now" });
  assert.equal(parseCommand("what is /memory"), null);
});

test("toPlain removes markdown markers but keeps the words", () => {
  assert.equal(toPlain("**Breakfast** – *akamu* and `ofada`"), "Breakfast – akamu and ofada");
  assert.equal(toPlain("- one\n- two"), "• one\n• two");
  assert.equal(toPlain("5 * 3"), "5 * 3");
});

test("splitMessage never exceeds the limit and loses no words", () => {
  const long = Array.from({ length: 900 }, (_, i) => `word${i}`).join(" ");
  const parts = splitMessage(long);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= TELEGRAM_LIMIT));
  assert.equal(parts.join(" ").split(/\s+/).length, 900);
});

test("a short message is one part", () => {
  assert.deepEqual(splitMessage("hello"), ["hello"]);
});
