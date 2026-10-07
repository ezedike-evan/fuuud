import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, parseInline } from "./markdown.ts";

test("bold becomes a bold node, not literal asterisks", () => {
  assert.deepEqual(parseInline("a **b** c"), [
    { t: "text", v: "a " },
    { t: "bold", v: [{ t: "text", v: "b" }] },
    { t: "text", v: " c" },
  ]);
});

test("a lone asterisk or snake_case stays literal", () => {
  assert.deepEqual(parseInline("5 * 3 and snake_case_name"), [{ t: "text", v: "5 * 3 and snake_case_name" }]);
});

test("lists and paragraphs split correctly", () => {
  const blocks = parseMarkdown("Try:\n- **Ofada** rice\n- moi moi\n\n1. one\n2. two\n\nDone.");
  assert.deepEqual(blocks.map((b) => b.t), ["p", "ul", "ol", "p"]);
  assert.equal((blocks[1] as { v: unknown[] }).v.length, 2);
});

test("html is never interpreted", () => {
  const [p] = parseMarkdown("<img src=x onerror=alert(1)> **ok**");
  assert.equal(p.t, "p");
  assert.ok(JSON.stringify(p).includes("<img"), "kept as text");
});

test("unterminated bold stays literal", () => {
  assert.deepEqual(parseInline("**oops"), [{ t: "text", v: "**oops" }]);
});
