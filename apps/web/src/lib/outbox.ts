/**
 * Saves that must count exactly once (external review #1, #9; P1 exit review X3, X9, X12).
 *
 * Each save gets a request id (`crypto.randomUUID()`) when it is created and is kept, with its exact body and
 * the account it belongs to, in this tab's sessionStorage until the API confirms it. Every retry — the "Try
 * again" button, a reload, the next page that flushes the outbox — resends the same id and body, and the API
 * answers a repeat with the response it stored the first time instead of counting it again.
 *
 * An entry is sent only with its own account's token; entries of any other account are dropped, never sent.
 * Entries are also dropped when the API refuses them for good (400, 409, 422), after a day (the API keeps
 * request ids for a week, so a retry never outlives that), and whenever this browser stops being signed in
 * (lib/keys.ts). Entries with the same `key` (one lesson's read mark) replace each other and are sent in order.
 */
import { api, ApiError } from "./api";
import { accountSub, ownerSub } from "./auth";
import { OUTBOX_KEY } from "./keys";

export type Entry = { id: string; path: string; body: Record<string, unknown>; at: number; owner: string; key?: string };

const MAX_AGE_MS = 24 * 3600 * 1000;
const FINAL = new Set([400, 409, 422]); // the API will never accept this body; anything else may be passing

function read(): Entry[] {
  try {
    const raw = sessionStorage.getItem(OUTBOX_KEY);
    const all = raw ? (JSON.parse(raw) as Entry[]) : [];
    return all.filter((e) => e && typeof e.id === "string" && typeof e.owner === "string" && Date.now() - e.at < MAX_AGE_MS);
  } catch {
    return [];
  }
}

function write(entries: Entry[]): void {
  try {
    if (entries.length) sessionStorage.setItem(OUTBOX_KEY, JSON.stringify(entries));
    else sessionStorage.removeItem(OUTBOX_KEY);
  } catch {}
}

const remove = (id: string) => write(read().filter((e) => e.id !== id));
const exists = (id: string) => read().some((e) => e.id === id);

/**
 * Adds a save for the signed-in account, at once and without a network call (so a failing token refresh can never
 * lose it: second exit review Y3); the body gets the request id the API uses to count it once. With a `key`,
 * unsent entries with the same key are replaced (latest wins). Throws 401 only when signed out.
 */
export function enqueue(path: string, body: Record<string, unknown>, key?: string): Entry {
  const owner = ownerSub();
  if (!owner) throw new ApiError(401, { title: "Not signed in", detail: "Sign in to save your work." });
  const id = crypto.randomUUID();
  const entry: Entry = { id, path, body: { ...body, requestId: id }, at: Date.now(), owner, ...(key ? { key } : {}) };
  const keep = read().filter((e) => !(key && e.key === key && e.path === path && !inFlight.has(e.id)));
  write([...keep, entry]);
  return entry;
}

const inFlight = new Set<string>();
const chains = new Map<string, Promise<unknown>>();

async function post<T>(entry: Entry): Promise<T> {
  inFlight.add(entry.id);
  try {
    // only with a token of the account the save belongs to (second exit review Y4)
    const me = await accountSub();
    if (!me) throw new ApiError(503, { title: "Not reachable", detail: "Your work is kept in this tab and will be sent when the connection is back." });
    if (me !== entry.owner) {
      remove(entry.id);
      throw new ApiError(409, { title: "Another account", detail: "This was saved by a different account and was not sent." });
    }
    const out = await api<T>(entry.path, { method: "POST", body: entry.body });
    remove(entry.id);
    return out;
  } catch (e) {
    if (e instanceof ApiError && FINAL.has(e.status)) remove(entry.id);
    throw e;
  } finally {
    inFlight.delete(entry.id);
  }
}

/**
 * Sends one entry; resolves with the API's answer and removes it. On failure it stays unless refused for good.
 * Entries with a key are sent one after another, and one replaced while waiting is skipped (resolves undefined).
 */
export function send<T>(entry: Entry): Promise<T> {
  if (!entry.key) return post<T>(entry);
  const chainKey = `${entry.path} ${entry.key}`;
  const run = (chains.get(chainKey) ?? Promise.resolve())
    .catch(() => {})
    .then(() => (exists(entry.id) ? post<T>(entry) : (undefined as T)));
  chains.set(chainKey, run);
  return run;
}

/** Sends this account's waiting entries (optionally only for one path); drops other accounts' and stale ones. */
export async function flush(path?: string): Promise<{ sent: number; left: number }> {
  const me = await accountSub();
  if (!me) return { sent: 0, left: read().length }; // offline or signed out: keep them for later
  const mine = read().filter((e) => e.owner === me);
  write(mine); // drops other accounts' entries and stale ones
  let sent = 0;
  for (const e of mine) {
    if ((path && e.path !== path) || inFlight.has(e.id)) continue;
    try {
      await send(e);
      sent += 1;
    } catch {}
  }
  return { sent, left: read().length };
}

/** This account's entries still waiting (for display, e.g. a read mark not yet confirmed). No network call. */
export function pending(path?: string): Entry[] {
  const me = ownerSub();
  return read().filter((e) => e.owner === me && (!path || e.path === path));
}

export function clearOutbox(): void {
  write([]);
}
