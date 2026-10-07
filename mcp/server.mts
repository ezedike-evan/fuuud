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
 *   KM_OWNER_ADDRESS     optional. Whose memory this server speaks for. Normally
 *                        derived from MEMWAL_ACCOUNT_ID: the account object on
 *                        Sui records its own owner, so there is nothing to repeat.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerTools, ALL_SCOPES, SERVER_INFO, SERVER_CAPABILITIES } from "../lib/mcp-tools.ts";
import { fetchOwnerOfAccount, grpcFor, relayerChain } from "../lib/account-lookup.ts";

/*
 * Whose record this speaks for is the wallet address that owns the account, and
 * the account object on Sui says so itself - so it is read from there rather
 * than asked for twice. KM_OWNER_ADDRESS still wins when set (the offline probe
 * has no account to read).
 */
async function resolveOwner(): Promise<string> {
  const given = process.env.KM_OWNER_ADDRESS?.trim();
  if (given) return given;

  const accountId = process.env.MEMWAL_ACCOUNT_ID?.trim();
  if (!accountId) {
    console.error("Set MEMWAL_ACCOUNT_ID (the owner address is read from it), or KM_OWNER_ADDRESS to name the owner directly.");
    process.exit(1);
  }
  try {
    const chain = await relayerChain(process.env.MEMWAL_SERVER_URL?.trim() || "https://relayer-staging.memory.walrus.xyz");
    return await fetchOwnerOfAccount(grpcFor(chain), accountId);
  } catch (error) {
    console.error(`Could not read the owner of ${accountId} from Sui: ${error instanceof Error ? error.message : error}. Set KM_OWNER_ADDRESS to name it directly.`);
    process.exit(1);
  }
}

const owner: string = await resolveOwner();

const server = new McpServer(SERVER_INFO, { capabilities: SERVER_CAPABILITIES });

// The local server is the person's own process: full access, no confirmation gate.
registerTools(server, { owner, scopes: ALL_SCOPES });

// stdout carries the MCP protocol — anything we say goes to stderr.
await server.connect(new StdioServerTransport());
console.error(`fuuud MCP ready for ${owner}`);
