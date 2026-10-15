import { createHash } from "node:crypto";
import {
  createMemoryStore,
  resolveKeyValueStore,
  type KeyValueStore,
  type RedisClientFactory,
} from "../kv";

// The one cross-request store for PUBLIC data — the catalog, discovery rows and
// public profiles, nothing else (tests/unit/use-cache-scope in apps/erp keeps
// the list of callers reviewed). It replaced Next's data cache when the API
// routes moved to apps/api: both hosts read and invalidate through this module,
// so a write in one is visible from the other on the next read.
//
// Layout. An entry lives under `pubcache:v1:<env>:<tag>:<gen>:<sha256(name, args)>`
// and `gen` is a counter per tag (`pubcache:v1:<env>:gen:<tag>`). Invalidating
// a tag increments its counter, which orphans every entry stored under the old
// one; Redis expires those on their own TTL. Nothing is scanned or deleted.
//
// Backend. Redis over REDIS_URL — the same store the rate limiter uses, so
// production already has it. Without REDIS_URL (dev, unit tests) a per-process
// map holds the same keys with the same TTL and generation semantics. A Redis
// failure never fails the request: the read goes to the loader, and the outage
// is logged once until Redis answers again.
//
// Freshness. The TTL is the caller's `revalidate` and is the guarantee; a tag
// bump only makes an edit visible sooner. A loader error is not cached and
// propagates as it would without the cache.

export type PublicStoreRead = {
  tag: string;
  // Distinguishes readers that share a tag: two zero-argument reads under the
  // same tag must not share an entry.
  name: string;
  args?: unknown[];
  ttlSeconds: number;
};

const KEY_VERSION = "pubcache:v1";

function envNamespace(): string {
  const explicit = process.env.EDURA_ENV?.trim();
  if (explicit) return explicit;
  return process.env.NODE_ENV === "production" ? "production" : "dev";
}

const genKey = (tag: string) => `${KEY_VERSION}:${envNamespace()}:gen:${tag}`;
const entryKey = (tag: string, gen: string | number, hash: string) =>
  `${KEY_VERSION}:${envNamespace()}:${tag}:${gen}:${hash}`;

function argsHash(name: string, args: unknown[]): string {
  return createHash("sha256").update(JSON.stringify([name, args])).digest("hex");
}

// Dates are the only non-JSON values these datasets carry; they are tagged on
// the way in and revived on the way out so a cached read returns what the
// loader returned. `undefined` (never returned by a loader) is not cacheable.
type DateBox = { $date: string | null };

function serialize(value: unknown): string | undefined {
  return JSON.stringify(value, function (this: Record<string, unknown>, key: string, val: unknown) {
    const raw = this[key];
    if (raw instanceof Date) {
      return { $date: Number.isNaN(raw.getTime()) ? null : raw.toISOString() } satisfies DateBox;
    }
    return val;
  });
}

function isDateBox(val: unknown): val is DateBox {
  return (
    typeof val === "object" &&
    val !== null &&
    "$date" in val &&
    Object.keys(val).length === 1
  );
}

function deserialize(body: string): unknown {
  return JSON.parse(body, (_key, val: unknown) =>
    isDateBox(val) ? new Date(val.$date ?? Number.NaN) : val,
  );
}

// ---------------------------------------------------------------------------
// Backends (kv port): the memory store is the fallback, Redis the shared one.

const memory = createMemoryStore();

let redisStore: KeyValueStore | null | undefined;
let degraded = false;

function noteFailure(err: unknown): void {
  if (degraded) return;
  degraded = true;
  const message = err instanceof Error ? err.message : String(err);
  console.error(
    `[public-cache] redis unavailable; public reads go to the database until it recovers: ${message}`,
  );
}

function noteSuccess(): void {
  if (!degraded) return;
  degraded = false;
  console.error("[public-cache] redis recovered; public reads are cached again.");
}

let redisFactory: RedisClientFactory | undefined;

async function getRedis(): Promise<KeyValueStore | null> {
  if (redisStore !== undefined) return redisStore;
  redisStore = await resolveKeyValueStore({
    url: process.env.REDIS_URL?.trim(),
    // Bounds what a slow Redis can add to a request, and fails a command at
    // once while the link is down instead of queueing it until reconnect.
    options: { commandTimeout: 1500, enableOfflineQueue: false },
    onError: noteFailure,
    onInitError: (err) =>
      console.error("[public-cache] redis init failed; using per-process memory:", err.message),
    factory: redisFactory,
  });
  return redisStore;
}

const REDIS_FAILED = Symbol("redis-failed");

async function tryRedis<T>(op: () => Promise<T>): Promise<T | typeof REDIS_FAILED> {
  try {
    const result = await op();
    noteSuccess();
    return result;
  } catch (err) {
    noteFailure(err);
    return REDIS_FAILED;
  }
}

async function readFromMemory<T>(read: PublicStoreRead, hash: string, loader: () => Promise<T>): Promise<T> {
  const key = entryKey(read.tag, (await memory.get(genKey(read.tag))) ?? "0", hash);
  const hit = await memory.get(key);
  if (hit !== null) return deserialize(hit) as T;
  const value = await loader();
  const body = serialize(value);
  if (body !== undefined) await memory.set(key, body, read.ttlSeconds * 1000);
  return value;
}

async function readFromRedis<T>(
  redis: KeyValueStore,
  read: PublicStoreRead,
  hash: string,
  loader: () => Promise<T>,
): Promise<T> {
  const gen = await tryRedis(() => redis.get(genKey(read.tag)));
  if (gen === REDIS_FAILED) return loader();
  const key = entryKey(read.tag, gen ?? "0", hash);
  const hit = await tryRedis(() => redis.get(key));
  if (hit === REDIS_FAILED) return loader();
  if (hit !== null) {
    try {
      return deserialize(hit) as T;
    } catch {
      // An unreadable entry is treated as a miss and overwritten below.
    }
  }
  const value = await loader();
  const body = serialize(value);
  if (body !== undefined) void tryRedis(() => redis.set(key, body, read.ttlSeconds * 1000));
  return value;
}

// ---------------------------------------------------------------------------
// Public surface

// Serves `loader()`'s result from the store for `ttlSeconds`, keyed on the
// reader's name and arguments under `tag`. The arguments must describe the
// DATA, never the caller: a session, a user id or a request header in `args`
// would make one person's answer another's.
export async function cachedRead<T>(read: PublicStoreRead, loader: () => Promise<T>): Promise<T> {
  const hash = argsHash(read.name, read.args ?? []);
  const redis = await getRedis();
  return redis ? readFromRedis(redis, read, hash, loader) : readFromMemory(read, hash, loader);
}

// Orphans every entry under `tag` in both backends. Fire-and-forget on the
// Redis side: the write it follows has committed, and the entry's own TTL
// still bounds how long a lost bump can matter. Never throws.
export function bumpPublicDataTag(tag: string): void {
  void memory.incr(genKey(tag));
  void getRedis().then((redis) => (redis ? tryRedis(() => redis.incr(genKey(tag))) : undefined));
}

export async function closePublicStore(): Promise<void> {
  const store = redisStore;
  redisStore = undefined;
  degraded = false;
  if (store) await store.close();
}

export function __resetPublicStoreForTests(): void {
  if (redisStore) redisStore.disconnect();
  redisStore = undefined;
  degraded = false;
  memory.clear();
}

// Lets a unit test stand in a fake client for the Redis path; `null` restores
// the real ioredis factory.
export function __setRedisFactoryForTests(factory: RedisClientFactory | null): void {
  redisFactory = factory ?? undefined;
}

export const __publicStoreKeysForTests = { genKey, entryKey, argsHash };
