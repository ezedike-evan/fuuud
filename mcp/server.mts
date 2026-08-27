#!/usr/bin/env node
/**
 * Fuuud — MCP server.
 *
 * Exposes one person's health memory to any MCP-speaking agent (Claude Code,
 * Cursor, a meal planner, another assistant) through the SAME contract the web
 * app uses. Nothing here reimplements the rules: recall thresholds, duplicate
 * detection, supersede stamping and allergen screening all come from ../lib.
 *
 * That is the point. Memory written by the web app is readable by your coding
 * agent; a fact your coding agent learns is enforced by the web app's safety
 * screen. The record is portable because it lives on Walrus, owned by the
 * person's own address — not inside either application.
 *
 *   MEMWAL_PRIVATE_KEY   delegate key (server-side only)
 *   MEMWAL_ACCOUNT_ID    the person's Walrus Memory account
 *   MEMWAL_SERVER_URL    relayer (defaults to staging)
 *   KM_OWNER_ADDRESS     whose memory this server speaks for
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  recallHealth, recallFeedback, rememberFact, forgetFact, resolveConflicts,
  claimsOfKind, isOffTheRecord,
} from "../lib/memory-core.ts";
import { screenReply, buildSafetyConstraintsText } from "../lib/safety.ts";
import { healthNs, feedbackNs } from "../lib/namespaces.ts";

const OWNER = process.env.KM_OWNER_ADDRESS;
if (!OWNER) {
  console.error("KM_OWNER_ADDRESS is required — the Sui address whose memory this server speaks for.");
  process.exit(1);
}
const owner: string = OWNER;

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const fail = (s: string) => ({ content: [{ type: "text" as const, text: s }], isError: true });

/** Stored lines look like `2026-08-24 | allergy | groundnuts — hives`. */
function render(facts: { text: string; distance: number }[]) {
  return facts.map((f) => `${f.text}   (distance ${f.distance.toFixed(3)})`).join("\n");
}

async function profile() {
  const health = resolveConflicts(await recallHealth(owner, "conditions and allergies")).active;
  return {
    conditions: claimsOfKind(health, "condition"),
    allergies: claimsOfKind(health, "allergy"),
    active: health,
  };
}

const server = new McpServer(
  { name: "fuuud", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.registerTool(
  "recall_memory",
  {
    title: "Recall health memory",
    description:
      "Search this person's own health memory by meaning. Returns dated facts — conditions, " +
      "allergies, foods they rejected, symptoms they reported. Call this BEFORE suggesting any " +
      "food, meal plan, restaurant or recipe. Results are already filtered for relevance and " +
      "conflict-resolved, so a newer fact has already beaten an older contradicting one.",
    inputSchema: {
      query: z.string().describe("What you want to know, in plain words. e.g. 'what can't they eat?'"),
      scope: z.enum(["health", "feedback", "both"]).default("both")
        .describe("health = conditions and allergies; feedback = rejected meals and symptoms"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ query, scope }) => {
    try {
      const want = scope ?? "both";
      const [h, f] = await Promise.all([
        want === "feedback" ? [] : recallHealth(owner, query),
        want === "health" ? [] : recallFeedback(owner, query),
      ]);
      const active = [...resolveConflicts(h).active, ...resolveConflicts(f).active];
      if (!active.length) return text("No relevant memory found. Do not assume they have no conditions — they may simply not have told anyone yet.");
      return text(`${active.length} fact(s) recalled for ${owner}:\n\n${render(active)}`);
    } catch (e) {
      return fail(`Recall failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

server.registerTool(
  "remember_fact",
  {
    title: "Remember a health fact",
    description:
      "Store a durable fact this person asserted about themselves. Write ONLY: a medical " +
      "condition they stated, an allergy or intolerance, a suggestion they rejected WITH a " +
      "reason, or a symptom after eating. NEVER write cravings, small talk, your own " +
      "suggestions, or anything from a turn where they said not to save it. " +
      "Writes reconcile automatically: an identical fact is skipped rather than duplicated, " +
      "and a contradicting one supersedes the old.",
    inputSchema: {
      kind: z.enum(["condition", "allergy", "rejection", "symptom"]),
      fact: z.string().describe("The fact in plain words, third person, no date. e.g. 'groundnuts — hives'"),
      user_turn: z.string().optional()
        .describe("The person's own words this came from. Used to honour 'don't save that'."),
    },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ kind, fact, user_turn }) => {
    try {
      if (user_turn && isOffTheRecord(user_turn)) {
        return text("Not stored — they asked for this to stay off the record.");
      }
      const r = await rememberFact(owner, kind, fact, { userTurn: user_turn });
      if (r.status === "skipped") {
        return text(
          r.reason === "duplicate"
            ? `Already known, nothing written:\n${r.existing}`
            : "Not stored — they asked for this to stay off the record.",
        );
      }
      return text(
        `Stored in ${r.namespace}:\n${r.text}` +
        (r.supersedes ? `\n\nThis supersedes:\n${r.supersedes}` : ""),
      );
    } catch (e) {
      return fail(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

server.registerTool(
  "check_meal",
  {
    title: "Check a meal against their memory",
    description:
      "Screen a proposed meal, recipe or menu against everything stored about this person. " +
      "This is a DETERMINISTIC check — it matches ingredient tokens against their recorded " +
      "allergens and condition restrictions, it does not ask a model. Run it on any food you " +
      "are about to recommend. A verdict of unsafe means do not suggest it.",
    inputSchema: {
      meal: z.string().describe("The meal or recipe text to screen, e.g. 'jollof rice with kuli kuli and grilled fish'"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ meal }) => {
    try {
      const { conditions, allergies } = await profile();
      const verdict = screenReply(meal, { conditions, allergies });
      if (verdict.safe) {
        return text(
          `SAFE — nothing in "${meal}" collides with their stored memory.\n` +
          `Screened against conditions [${conditions.join(", ") || "none"}] and allergies [${allergies.join(", ") || "none"}].`,
        );
      }
      return text(
        `UNSAFE — do not suggest this.\n` +
        (verdict.allergenFlags.length ? `Allergen hits: ${verdict.allergenFlags.join(", ")}\n` : "") +
        (verdict.conditionFlags.length ? `Condition restrictions hit: ${verdict.conditionFlags.join(", ")}\n` : "") +
        `\nConstraints on file:\n${buildSafetyConstraintsText({ conditions, allergies })}`,
      );
    } catch (e) {
      return fail(`Screening failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

server.registerTool(
  "forget_fact",
  {
    title: "Retract a stored fact",
    description:
      "Retract a fact this person says is no longer true, or has asked you to forget. Going " +
      "quiet about a fact is NOT the same as retracting it — an un-retracted fact comes back " +
      "on the next recall, in the next session, forever. " +
      "This writes a retraction that outranks the claim, so nothing can read it again. It does " +
      "NOT erase: the original entry stays encrypted on Walrus under their own keys until its " +
      "storage period expires. Say that plainly if they ask.",
    inputSchema: {
      fact: z.string().describe("The claim to retract, in their words. e.g. 'groundnut allergy'"),
    },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  async ({ fact }) => {
    try {
      const r = await forgetFact(owner, fact);
      if (r.status === "not-found") {
        return text(`Nothing close to "${fact}" is stored, so there is nothing to retract.`);
      }
      return text(
        `Retracted in ${r.namespace}:\n${r.target}\n\n` +
        `Written as:\n${r.tombstone}\n\n` +
        `It will not be recalled again. The original entry is still on Walrus, encrypted, ` +
        `until its storage period expires — it is out of reach, not erased.`,
      );
    } catch (e) {
      return fail(`Retraction failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

server.registerTool(
  "list_memory",
  {
    title: "List what recall can reach",
    description:
      "Everything two deliberately broad recalls can reach across both namespaces, with " +
      "superseded and retracted entries shown separately. Use when they ask what the agent " +
      "knows. Note this is a recall, not an index dump — the SDK has no list operation, so " +
      "present it as what the agent can currently see rather than as a complete record.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    try {
      const [h, f] = await Promise.all([
        recallHealth(owner, "conditions, allergies and foods to avoid"),
        recallFeedback(owner, "rejected meals and reported symptoms"),
      ]);
      const H = resolveConflicts(h);
      const F = resolveConflicts(f);
      const superseded = [...H.superseded, ...F.superseded];
      const retracted = [...H.retracted, ...F.retracted];
      const active = [...H.active, ...F.active];

      if (!active.length && !superseded.length && !retracted.length) {
        return text(`Nothing stored yet for ${owner}.`);
      }
      return text(
        `Memory for ${owner} — what recall can reach right now, not an index dump.\n` +
        `  ${healthNs(owner)}\n  ${feedbackNs(owner)}\n\n` +
        `ACTIVE (${active.length})\n${render(active) || "  none"}` +
        (superseded.length ? `\n\nSUPERSEDED (${superseded.length}) — kept, but outranked by a newer fact\n${render(superseded)}` : "") +
        (retracted.length ? `\n\nRETRACTED (${retracted.length}) — they took these back; still on Walrus, never read\n${render(retracted)}` : ""),
      );
    } catch (e) {
      return fail(`Listing failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

server.registerResource(
  "health-profile",
  "fuuud://profile",
  {
    title: "Health profile",
    description: "The person's current conditions and allergies, distilled from their memory.",
    mimeType: "application/json",
  },
  async (uri) => {
    const { conditions, allergies } = await profile();
    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({ owner, conditions, allergies }, null, 2),
      }],
    };
  },
);

// stdout carries the MCP protocol — anything we say goes to stderr.
await server.connect(new StdioServerTransport());
console.error(`fuuud MCP ready for ${owner}`);
