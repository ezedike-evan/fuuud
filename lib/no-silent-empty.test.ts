import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * REGRESSION GUARD: a failed read of someone's health record must never be turned into an
 * EMPTY record. In a health app those look identical on screen, and an empty one reads as
 * "no allergies". Several pages did `recall(...).catch(() => [])`, so a refused key showed
 * a blank memory after minutes of retries. Callers must handle the failure and say so.
 */
const ROOT = join(import.meta.dirname, "..");
const files = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".next") continue;
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
};

const SWALLOWED_READ = /\b(?:recall(?:Safety|Preferences|Feedback|Plan|Health)|listMemory)\s*\([^)]*\)\s*\.catch\(\s*(?:async\s*)?\(\s*[^)]*\)\s*=>\s*(?:\[\]|\(\{|null|undefined)/;

test("no page, action or library turns a failed memory read into an empty result", () => {
  const offenders = [...files(join(ROOT, "app")), ...files(join(ROOT, "lib"))]
    .filter((p) => SWALLOWED_READ.test(readFileSync(p, "utf8")))
    .map((p) => relative(ROOT, p));
  assert.deepEqual(offenders, []);
});

test("the guard's pattern really matches the shapes it exists to catch", () => {
  for (const bad of [
    "recallSafety(address).catch(() => [])",
    "await recallPlan(address).catch(() => [])",
    "recallHealth(address, \"medical conditions\").catch(() => [])",
    "await listMemory().catch(() => ({ health: empty }))",
    "recallPreferences(address).catch((e) => [])",
  ]) assert.ok(SWALLOWED_READ.test(bad), bad);
  assert.ok(!SWALLOWED_READ.test("recallSafety(address)"), "a plain read is fine");
  assert.ok(!SWALLOWED_READ.test("syncReminders(a, m).catch((error) => { console.error(error); return 1; })"));
});
