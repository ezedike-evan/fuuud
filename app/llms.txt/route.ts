import { ALLERGEN_PAGES, ALLERGY_HUB, CONNECT, GUIDES_HOME, HOME, PRIVACY, PRIVATE_MEMORY, TERMS } from "@/lib/pages";
import { absolute, siteUrl } from "@/lib/seo";

export const dynamic = "force-static";

/** A plain-text map of the site for AI assistants and search tools (llmstxt.org format). */
export function GET() {
  const link = (p: { path: string; title: string; description: string }) => `- [${p.title}](${absolute(p.path)}): ${p.description}`;
  const body = [
    "# Fuuud",
    "",
    `> ${HOME.description}`,
    "",
    "Fuuud stores a person's allergies, conditions and food preferences as dated one-line facts in an encrypted record on Walrus that they own. It is food guidance, not medical advice.",
    "",
    "## Guides",
    link(GUIDES_HOME),
    link(PRIVATE_MEMORY),
    link(CONNECT),
    link(ALLERGY_HUB),
    ...ALLERGEN_PAGES.map(link),
    "",
    "## Connect your AI app",
    `Fuuud runs a hosted MCP server with OAuth at ${siteUrl()}/api/mcp. Tools: recall_memory, remember_fact, forget_fact, check_meal, list_memory. See ${absolute(CONNECT.path)}.`,
    "",
    "## Legal",
    link(PRIVACY),
    link(TERMS),
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
