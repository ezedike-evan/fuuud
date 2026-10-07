import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * REGRESSION GUARD for a bug that shipped: the per-person memory account was recorded
 * with AsyncLocalStorage.enterWith() inside an awaited helper, which the code awaiting
 * it can NOT see. Every page believed nobody had an account, bounced to /setup, and a
 * finished setup looked like it did nothing; the memory layer would have fallen back to
 * a shared account.
 *
 * The form that holds is an explicit wrapper around the whole handler (`inScope`). These
 * checks make forgetting it a test failure instead of a production surprise.
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
const read = (p: string) => readFileSync(p, "utf8");
const rel = (p: string) => relative(ROOT, p);

test("nothing but the scope module itself may call enterScope (enterWith in a callee is invisible to its caller)", () => {
  const offenders = [...files(join(ROOT, "app")), ...files(join(ROOT, "lib")), ...files(join(ROOT, "components"))]
    .filter((p) => !p.endsWith("lib/memwal-scope.ts"))
    .filter((p) => /\benterScope\s*\(/.test(read(p)));
  assert.deepEqual(offenders.map(rel), []);
});

/** What makes a server-side entry point depend on the person's account. */
const TOUCHES_MEMORY = /\b(recallSafety|recallPreferences|recallFeedback|recallPlan|listMemory|rememberFact|forgetFact|rememberPlanBatch|buildPlanWeek|getPlanWeek|currentScope|requireAccount)\s*\(/;

const entryPoints = () => files(join(ROOT, "app")).filter((p) => /\/(page|route)\.tsx?$|\/actions\//.test(p));

test("every page, route and action that touches memory or the account runs inside inScope or runInScope", () => {
  const missing = entryPoints()
    .filter((p) => TOUCHES_MEMORY.test(read(p)))
    .filter((p) => !/\b(inScope|runInScope)\b/.test(read(p)));
  assert.deepEqual(missing.map(rel), [], "these reach memory without the person's account in scope");
});

test("the guard is not vacuous: it finds the entry points it is meant to protect", () => {
  const names = entryPoints().filter((p) => TOUCHES_MEMORY.test(read(p))).map(rel);
  for (const must of ["app/agent/page.tsx", "app/api/chat/route.ts", "app/actions/memory.ts", "app/actions/plan.ts", "app/setup/page.tsx"]) {
    assert.ok(names.includes(must), `${must} should be recognised as memory-touching`);
  }
});

test("a server-rendered page cannot rely on getOwnerAddress alone to set the scope", () => {
  const session = read(join(ROOT, "lib/session.ts"));
  const start = session.indexOf("export async function getOwnerAddress");
  const body = session.slice(start, session.indexOf("\n}\n", start));
  assert.ok(body.length > 20, "found the function");
  assert.ok(!/enterScope|bindMemwal|enterWith|runInScope|credsFor/.test(body), "getOwnerAddress must stay a pure identity lookup");
});

test("AsyncLocalStorage semantics this design depends on (documented so nobody 'simplifies' it back)", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const als = new AsyncLocalStorage<{ v: number }>();
  const tick = () => new Promise((r) => setTimeout(r, 2));

  // enterWith inside an awaited callee is NOT visible to the caller.
  const callee = async () => { await tick(); als.enterWith({ v: 1 }); };
  const viaCallee = await als.run(undefined as never, async () => { await callee(); return als.getStore(); });
  assert.equal(viaCallee, undefined);

  // run() around the work IS visible across awaits.
  const viaRun = await als.run({ v: 2 }, async () => { await tick(); await tick(); return als.getStore(); });
  assert.deepEqual(viaRun, { v: 2 });
});
