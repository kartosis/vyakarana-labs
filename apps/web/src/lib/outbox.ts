/**
 * Saves that must count exactly once (external review #1, #9).
 *
 * Each save gets a request id (`crypto.randomUUID()`) when it is created and is kept, with its exact body, in
 * this tab's sessionStorage until the server confirms it. Every retry — the "Try again" button, a reload, the
 * next page that flushes the outbox — resends the same id and body, and the API answers a repeat with the
 * response it stored the first time instead of counting it again.
 *
 * Entries are dropped when the server accepts them, when it refuses them for good (any 4xx except 401, 408
 * and 429), after a day (the API keeps request ids for a week, so a retry never outlives that), and on
 * sign-out (so nothing is sent to the next account used in this tab).
 */
import { api, ApiError } from "./api";

export type Entry = { id: string; path: string; body: Record<string, unknown>; at: number };

const KEY = "vl:outbox";
const MAX_AGE_MS = 24 * 3600 * 1000;

function read(): Entry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Entry[]) : [];
    return all.filter((e) => e && typeof e.id === "string" && Date.now() - e.at < MAX_AGE_MS);
  } catch {
    return [];
  }
}

function write(entries: Entry[]): void {
  try {
    if (entries.length) sessionStorage.setItem(KEY, JSON.stringify(entries));
    else sessionStorage.removeItem(KEY);
  } catch {}
}

const remove = (id: string) => write(read().filter((e) => e.id !== id));

/** Adds a save to the outbox; the body gets the request id the API uses to count it once. */
export function enqueue(path: string, body: Record<string, unknown>): Entry {
  const id = crypto.randomUUID();
  const entry: Entry = { id, path, body: { ...body, requestId: id }, at: Date.now() };
  write([...read(), entry]);
  return entry;
}

/** True when the API will never accept this body, so retrying is pointless. */
const permanent = (e: unknown) => e instanceof ApiError && e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status);

/** Sends one entry. Resolves with the API's answer and removes the entry; on failure the entry stays unless refused for good. */
export async function send<T>(entry: Entry): Promise<T> {
  try {
    const out = await api<T>(entry.path, { method: "POST", body: entry.body });
    remove(entry.id);
    return out;
  } catch (e) {
    if (permanent(e)) remove(entry.id);
    throw e;
  }
}

/** Sends whatever earlier pages or tries left behind (also prunes stale entries). Never throws. */
export async function flush(path?: string): Promise<{ sent: number; left: number }> {
  const all = read();
  write(all); // persist the pruning of stale entries
  let sent = 0;
  for (const e of all) {
    if (path && e.path !== path) continue;
    try {
      await send(e);
      sent += 1;
    } catch {}
  }
  return { sent, left: read().length };
}

export function pending(path?: string): Entry[] {
  return read().filter((e) => !path || e.path === path);
}

export function clearOutbox(): void {
  write([]);
}
