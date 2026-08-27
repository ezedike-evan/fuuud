/**
 * Verifies the Kitchen Memory MCP server actually speaks MCP: handshake, tool
 * discovery, and one call of each tool.
 *
 *   pnpm mcp:probe
 *
 * Without MEMWAL credentials the server runs on the in-memory mock, so every
 * tool is exercised for real — write, recall, screen — with no network and no
 * keys. With credentials in .env.local it runs against the live relayer
 * instead. Either way the whole contract is checked end to end.
 */
import { spawn } from "node:child_process";

const owner = process.env.KM_OWNER_ADDRESS ?? "0xprobe0000000000000000000000000000000000";
const live = Boolean(process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID);

// Pass the environment through untouched. Injecting placeholder MEMWAL values
// here would read as real credentials and send the server down the live path
// with a key it cannot parse, instead of onto the mock.
const child = spawn("node", ["--experimental-strip-types", "mcp/server.mts"], {
  env: { ...process.env, KM_OWNER_ADDRESS: owner },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const waiters = new Map();
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const resolve = waiters.get(msg.id);
    if (resolve) { waiters.delete(msg.id); resolve(msg); }
  }
});
child.stderr.on("data", (d) => {
  const s = String(d);
  if (!s.includes("MODULE_TYPELESS") && !s.includes("Reparsing") && !s.includes("trace-warnings") && !s.includes("eliminate this warning")) {
    process.stderr.write(`  [server] ${s}`);
  }
});

let nextId = 1;
function call(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiters.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error(`${method} timed out`)), 30_000);
  });
}

const first = (m) => m.result?.content?.[0]?.text ?? JSON.stringify(m.result ?? m.error);
const line = (s) => String(s).split("\n")[0].slice(0, 96);

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}

try {
  const init = await call("initialize", {
    protocolVersion: "2024-11-05", capabilities: {},
    clientInfo: { name: "kitchen-memory-probe", version: "1" },
  });
  check("handshake", init.result?.serverInfo?.name === "kitchen-memory", init.result?.protocolVersion);

  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const tools = await call("tools/list", {});
  const names = tools.result.tools.map((t) => t.name).sort();
  check("tools advertised", names.length === 5, names.join(", "));

  const resources = await call("resources/list", {});
  check("resource advertised", resources.result.resources.length === 1, resources.result.resources[0]?.uri);

  console.log(`\nmode: ${live ? "LIVE (MEMWAL credentials present)" : "MOCK (no credentials — in-memory store)"}\n`);

  // A meal that is safe until the person tells us otherwise.
  const before = await call("tools/call", {
    name: "check_meal", arguments: { meal: "jollof rice with kuli kuli and grilled titus" },
  });
  check("check_meal clears the meal while nothing is stored",
    first(before).startsWith("SAFE"), line(first(before)));

  const wrote = await call("tools/call", {
    name: "remember_fact",
    arguments: { kind: "allergy", fact: "groundnuts - hives", user_turn: "groundnuts bring me out in hives" },
  });
  check("remember_fact stores an asserted allergy", first(wrote).startsWith("Stored in"), line(first(wrote)));

  const again = await call("tools/call", {
    name: "remember_fact",
    arguments: { kind: "allergy", fact: "groundnuts - hives", user_turn: "groundnuts bring me out in hives" },
  });
  check("identical fact is skipped, not duplicated", first(again).startsWith("Already known"), line(first(again)));

  const recall = await call("tools/call", {
    name: "recall_memory", arguments: { query: "groundnuts", scope: "both" },
  });
  check("recall_memory returns the stored fact",
    first(recall).includes("groundnuts - hives"), line(first(recall)));

  // Same meal, same tool — the verdict flips because the memory changed.
  const after = await call("tools/call", {
    name: "check_meal", arguments: { meal: "jollof rice with kuli kuli and grilled titus" },
  });
  check("check_meal now blocks it on the stored allergen",
    first(after).startsWith("UNSAFE") && first(after).includes("kuli kuli"), line(first(after)));

  const off = await call("tools/call", {
    name: "remember_fact",
    arguments: { kind: "allergy", fact: "cashews — swelling", user_turn: "cashews swell my lips but don't save that" },
  });
  check("off-the-record refused before any write", first(off).includes("off the record"), line(first(off)));

  const list = await call("tools/call", { name: "list_memory", arguments: {} });
  check("list_memory shows it and not the refused one",
    first(list).includes("groundnuts") && !first(list).includes("cashews"), line(first(list)));

  // RETRACTION. There is no delete in the SDK, so forgetting is a tombstone
  // that outranks the claim. The proof is the same three tools disagreeing
  // with themselves afterwards.
  const missing = await call("tools/call", {
    name: "forget_fact", arguments: { fact: "a shellfish thing nobody mentioned" },
  });
  check("forget_fact retracts nothing when nothing matches",
    first(missing).includes("nothing to retract"), line(first(missing)));

  const forgot = await call("tools/call", { name: "forget_fact", arguments: { fact: "groundnuts - hives" } });
  check("forget_fact retracts the stored allergy",
    first(forgot).startsWith("Retracted in"), line(first(forgot)));

  check("retraction is honest that Walrus still holds the entry",
    first(forgot).includes("not erased"), line(first(forgot)));

  const gone = await call("tools/call", {
    name: "recall_memory", arguments: { query: "groundnuts", scope: "both" },
  });
  check("recall_memory no longer returns a retracted fact",
    !first(gone).includes("allergy | groundnuts - hives"), line(first(gone)));

  const cleared = await call("tools/call", {
    name: "check_meal", arguments: { meal: "jollof rice with kuli kuli and grilled titus" },
  });
  check("check_meal clears the meal again once the allergy is retracted",
    first(cleared).startsWith("SAFE"), line(first(cleared)));

  const listAfter = await call("tools/call", { name: "list_memory", arguments: {} });
  check("list_memory still shows the retracted entry, in its own section",
    first(listAfter).includes("RETRACTED") || String(listAfter.result?.content?.[0]?.text).includes("RETRACTED"),
    line(first(listAfter)));

  console.log(`\n${failures === 0 ? "all green" : `${failures} failing`}`);
} catch (e) {
  console.error("probe error:", e.message);
  failures++;
} finally {
  child.kill();
}
process.exit(failures === 0 ? 0 : 1);
