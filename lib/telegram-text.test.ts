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

import { formatMemory } from "./telegram-text.ts";

test("formatMemory groups by kind, formats dates and escapes", () => {
  const out = formatMemory([
    "2026-10-07 | allergy | groundnuts - hives",
    "2026-10-06 | dislike | okra <script>",
    "2026-10-05 | condition | type 2 diabetes - SUPERSEDES: old",
    "2026-10-05 | mystery | something",
  ]);
  assert.match(out, /<b>🚫 Allergies<\/b>\n• groundnuts - hives <i>\(7 Oct 2026\)<\/i>/);
  assert.match(out, /okra &lt;script&gt;/);
  assert.ok(!out.includes("SUPERSEDES"));
  assert.match(out, /<b>📝 Other<\/b>/);
  assert.ok(out.indexOf("Allergies") < out.indexOf("Conditions"));
});

test("formatMemory with nothing stored says so", () => {
  assert.match(formatMemory([]), /do not know anything/);
});
