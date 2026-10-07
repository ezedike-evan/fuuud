import "server-only";
import type { PushSubscription } from "web-push";
import { kvDel, kvGet, kvSet, kvSetAdd, kvSetRemove, kvSetMembers } from "./kv.ts";
import type { Reminder } from "./reminders.ts";

/** Everything the scheduler needs for one person. Nothing clinical. */
export type NotifyRecord = {
  /** Browser `getTimezoneOffset()`: minutes to add to local time to get UTC. */
  tz: number;
  telegramChatId?: string;
  /** The grant (own delegate key) the Telegram chat speaks to memory with. Absent = reminders only. */
  telegramGrantId?: string;
  push?: PushSubscription;
  reminders: Reminder[];
};

const key = (address: string) => `notify:${address.toLowerCase()}`;
const USERS = "notify:users";

export async function getRecord(address: string): Promise<NotifyRecord | null> {
  return kvGet<NotifyRecord>(key(address));
}

export const hasChannel = (r: NotifyRecord | null) => Boolean(r && (r.telegramChatId || r.push));

export async function saveRecord(address: string, record: NotifyRecord): Promise<void> {
  // A record with no channel left holds no reason to exist: drop it, so we keep
  // no meal names for someone who has switched every channel off.
  if (!hasChannel(record)) {
    await kvDel(key(address));
    await kvSetRemove(USERS, address.toLowerCase());
    return;
  }
  await kvSet(key(address), record);
  await kvSetAdd(USERS, address.toLowerCase());
}

export const allUsers = () => kvSetMembers(USERS);

export async function updateRecord(address: string, patch: (r: NotifyRecord) => NotifyRecord) {
  const current = (await getRecord(address)) ?? { tz: 0, reminders: [] };
  const next = patch(current);
  await saveRecord(address, next);
  return next;
}
