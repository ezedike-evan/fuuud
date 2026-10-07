import { test } from "node:test";
import assert from "node:assert/strict";
import { overall, isSettled, stageLabel } from "./write-stages.ts";

test("one failed job fails the whole save, never reads as saved", () => {
  assert.equal(overall(["done", "failed"]), "failed");
  assert.equal(overall(["done", "not_found"]), "failed");
});
test("saved only when every job is done", () => {
  assert.equal(overall(["done", "uploaded"]), "uploaded");
  assert.equal(overall(["done", "done"]), "done");
  assert.equal(overall(["done", undefined]), undefined);
});
test("settled states", () => {
  assert.ok(isSettled("done") && isSettled("failed") && !isSettled("running") && !isSettled(undefined));
  assert.equal(stageLabel("done"), "Saved");
});
