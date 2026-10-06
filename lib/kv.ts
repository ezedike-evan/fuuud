/**
 * The ONLY non-Walrus store in the app, and deliberately tiny.
 *
 * Health facts live on Walrus, encrypted to the person. What lives here is what
 * a scheduler cannot do without: a Telegram chat id, a Web Push subscription,
 * and the reminders already screened for them (meal name + time). A cron job
 * has no request, no cookie and no delegate key, so it cannot read Walrus.
 *
 * Upstash Redis over its REST API (also the variable names Vercel's KV
 * integration provides), so there is no client dependency. Without credentials
 * it falls back to a process-local Map: fine for `pnpm dev`, and it forgets
 * everything on restart, so it is refused in production rather than quietly
 * losing reminders.
 */

const url = () => (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim();
const token = () => (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim();

export const kvConfigured = () => Boolean(url() && token());

type Mem = { values: Map<string, { v: string; exp?: number }>; sets: Map<string, Set<string>> };
const mem: Mem = ((globalThis as { __fuuudKv?: Mem }).__fuuudKv ??= { values: new Map(), sets: new Map() });

function assertUsable() {
  if (!kvConfigured() && process.env.NODE_ENV === "production") {
    throw new Error("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are required in production for reminders.");
  }
}

async function cmd(...args: (string | number)[]): Promise<unknown> {
  const res = await fetch(url()!, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || body.error) throw new Error(`kv ${String(args[0])}: ${body.error ?? res.status}`);
  return body.result;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  assertUsable();
  if (!kvConfigured()) {
    const hit = mem.values.get(key);
    if (!hit || (hit.exp && hit.exp < Date.now())) return null;
    return JSON.parse(hit.v) as T;
  }
  const raw = (await cmd("GET", key)) as string | null;
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  assertUsable();
  const raw = JSON.stringify(value);
  if (!kvConfigured()) {
    mem.values.set(key, { v: raw, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });
    return;
  }
  await (ttlSeconds ? cmd("SET", key, raw, "EX", ttlSeconds) : cmd("SET", key, raw));
}

export async function kvDel(key: string): Promise<void> {
  assertUsable();
  if (!kvConfigured()) {
    mem.values.delete(key);
    return;
  }
  await cmd("DEL", key);
}

export async function kvSetAdd(key: string, member: string): Promise<void> {
  assertUsable();
  if (!kvConfigured()) {
    (mem.sets.get(key) ?? mem.sets.set(key, new Set()).get(key)!).add(member);
    return;
  }
  await cmd("SADD", key, member);
}

export async function kvSetRemove(key: string, member: string): Promise<void> {
  assertUsable();
  if (!kvConfigured()) {
    mem.sets.get(key)?.delete(member);
    return;
  }
  await cmd("SREM", key, member);
}

export async function kvSetMembers(key: string): Promise<string[]> {
  assertUsable();
  if (!kvConfigured()) return [...(mem.sets.get(key) ?? [])];
  return ((await cmd("SMEMBERS", key)) as string[]) ?? [];
}
