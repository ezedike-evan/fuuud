import { mcpUrl } from "@/lib/app-url.ts";
import { intakeDelegate } from "@/lib/delegate-intake.ts";
import { kvDel, kvIncr } from "@/lib/kv.ts";
import { activateGrant, createGrant, getGrant, GrantLimitError, revokeGrant } from "@/lib/oauth/grants.ts";
import { oauthConfigured } from "@/lib/seal.ts";
import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { bindingKey, createLink, telegramConfigured } from "@/lib/telegram.ts";
import { getRecord, updateRecord } from "@/lib/notify-store.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LINKS_PER_HOUR = 10;

/**
 * Start linking: returns the t.me deep link for this signed-in person.
 *
 * With a delegate key in the body the chat can talk to memory, using that key (its own,
 * minted in the browser and registered onchain by the person's wallet - never the web
 * app's). Without one the link is reminders-only.
 */
async function postHandler(req: Request) {
  const owner = await getOwnerAddress();
  if (!owner) return new Response("Not signed in", { status: 401 });
  if (!telegramConfigured()) return new Response("TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME are not set.", { status: 503 });

  try {
    if ((await kvIncr(`tg:link:${owner.toLowerCase()}`, 3600)) > LINKS_PER_HOUR) {
      return Response.json({ error: "Too many attempts. Try again in a while." }, { status: 429 });
    }
  } catch (error) {
    console.error("[fuuud] telegram link limit unavailable:", error instanceof Error ? error.message : error);
  }

  const raw = await req.text();
  if (raw.length > 4096) return Response.json({ error: "Request too large." }, { status: 413 });
  let body: { publicKey?: unknown; privateKey?: unknown; devMock?: unknown } = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
  }

  const wantsChat = body.devMock === true || typeof body.privateKey === "string";
  if (!wantsChat) return Response.json({ url: await createLink(owner), chat: false });
  if (!oauthConfigured()) {
    return Response.json({ error: "Chat needs OAUTH_SECRET on the server (it seals the chat's key). Reminders still work without it." }, { status: 503 });
  }

  const intake = await intakeDelegate(owner, body);
  if (!intake.ok) return Response.json({ error: intake.message }, { status: intake.status });

  try {
    const grant = await createGrant({
      owner,
      clientId: "fuuud-telegram",
      clientName: "Fuuud Telegram",
      publicKey: intake.publicKey,
      creds: intake.creds,
      scopes: ["memory:read", "memory:write"],
      resource: mcpUrl(),
    });
    await activateGrant(grant.id);
    return Response.json({ url: await createLink(owner, grant.id), chat: true });
  } catch (error) {
    if (error instanceof GrantLimitError) return Response.json({ error: error.message }, { status: 409 });
    console.error("[fuuud] could not create telegram grant:", error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not save the connection. Try again." }, { status: 503 });
  }
}

/** Unlink Telegram: forget the chat, and revoke the key it chatted with. */
async function deleteHandler() {
  const owner = await getOwnerAddress();
  if (!owner) return new Response("Not signed in", { status: 401 });

  const record = await getRecord(owner);
  if (record?.telegramGrantId) {
    const grant = await getGrant(record.telegramGrantId);
    if (grant && grant.owner === owner.toLowerCase()) await revokeGrant(grant.id);
  }
  if (record?.telegramChatId) await kvDel(bindingKey(record.telegramChatId)).catch(() => undefined);
  await updateRecord(owner, ({ telegramChatId: _chat, telegramGrantId: _grant, ...rest }) => rest);
  return Response.json({ ok: true });
}

export const POST = (req: Request) => inScope(() => postHandler(req));
export const DELETE = () => deleteHandler();
