import "server-only";
import { Composio } from "@composio/core";

/**
 * Composio gives each person their own authorised connection to Telegram and
 * Google Calendar. `userId` is ALWAYS the person's Sui address (lowercased, the
 * same string namespaces are built from), so a connection belongs to one record
 * and one person - never to the app.
 *
 * UNVERIFIED AGAINST A LIVE KEY: written from the @composio/core docs without an
 * install or a COMPOSIO_API_KEY. Tool slugs and argument names below are the
 * ones the docs list; confirm each with `composio.tools.get` before relying on it.
 */

export type Toolkit = "telegram" | "googlecalendar";

const AUTH_CONFIG_ENV: Record<Toolkit, string> = {
  telegram: "COMPOSIO_TELEGRAM_AUTH_CONFIG_ID",
  googlecalendar: "COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID",
};

let client: Composio | null = null;

function composio() {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not set.");
  return (client ??= new Composio({ apiKey }));
}

export const composioConfigured = () => Boolean(process.env.COMPOSIO_API_KEY?.trim());

const userIdFor = (address: string) => address.trim().toLowerCase();

/** Start a connection; the caller redirects the person to the returned URL. */
export async function startConnection(address: string, toolkit: Toolkit, callbackUrl?: string) {
  const authConfigId = process.env[AUTH_CONFIG_ENV[toolkit]]?.trim();
  if (!authConfigId) throw new Error(`${AUTH_CONFIG_ENV[toolkit]} is not set.`);
  const request = await composio().connectedAccounts.link(userIdFor(address), authConfigId, { callbackUrl });
  return { redirectUrl: request.redirectUrl };
}

/** Which toolkits this person has an ACTIVE connection for. */
export async function connectedToolkits(address: string): Promise<Toolkit[]> {
  const list = await composio().connectedAccounts.list({
    userIds: [userIdFor(address)],
    statuses: ["ACTIVE"],
  });
  const slugs = new Set(list.items.map((a) => a.toolkit.slug.toLowerCase()));
  return (["telegram", "googlecalendar"] as const).filter((t) => slugs.has(t));
}

async function run(address: string, slug: string, args: Record<string, unknown>) {
  return composio().tools.execute(slug, { userId: userIdFor(address), arguments: args });
}

export const sendTelegram = (address: string, chatId: string, text: string) =>
  run(address, "TELEGRAM_SEND_MESSAGE", { chat_id: chatId, text });

export const createCalendarEvent = (
  address: string,
  event: { summary: string; start: string; end: string; description?: string },
) =>
  run(address, "GOOGLECALENDAR_CREATE_EVENT", {
    summary: event.summary,
    start_datetime: event.start,
    end_datetime: event.end,
    description: event.description,
  });
