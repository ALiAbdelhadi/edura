import { createMemoryStore, resolveKeyValueStore, type KeyValueStore } from "../kv";

const memory = createMemoryStore();

function envNamespace(): string {
  const explicit = process.env.EDURA_ENV?.trim();
  if (explicit) return explicit;
  return process.env.NODE_ENV === "production" ? "production" : "dev";
}

function namespacedKey(key: string): string {
  return `rl:${envNamespace()}:${key}`;
}

let redisStore: KeyValueStore | null | undefined;

const OPEN_AFTER = 3;
const COOLDOWN_MS = 30_000;
const EVAL_DEADLINE_MS = 1_500;
let consecutiveFailures = 0;
let breakerOpenedAt = 0;

function breakerIsOpen(): boolean {
  if (breakerOpenedAt === 0) return false;
  if (Date.now() - breakerOpenedAt >= COOLDOWN_MS) {
    breakerOpenedAt = 0;
    consecutiveFailures = OPEN_AFTER - 1;
    return false;
  }
  return true;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= OPEN_AFTER && breakerOpenedAt === 0) {
    breakerOpenedAt = Date.now();
    console.error(
      `[rate-limit] redis unavailable after ${consecutiveFailures} failures; ` +
        `serving from per-process memory for ${COOLDOWN_MS / 1000}s. ` +
        `Limits are NO LONGER shared across instances.`,
    );
  }
}

function recordSuccess(): void {
  if (consecutiveFailures > 0 || breakerOpenedAt !== 0) {
    if (breakerOpenedAt !== 0) console.error("[rate-limit] redis recovered; limits shared again.");
    consecutiveFailures = 0;
    breakerOpenedAt = 0;
  }
}

export function rateLimiterDegraded(): boolean {
  return breakerOpenedAt !== 0;
}

async function getRedis(): Promise<KeyValueStore | null> {
  if (redisStore !== undefined) return redisStore;
  redisStore = await resolveKeyValueStore({
    url: process.env.REDIS_URL,
    onError: (e) => {
      if (process.env.RATE_LIMIT_DEBUG) console.error("[rate-limit] redis error:", e.message);
    },
    onInitError: (e) => console.error("[rate-limit] redis init failed, using in-memory:", e.message),
  });
  return redisStore;
}

export async function closeRateLimiter(): Promise<void> {
  const store = redisStore;
  redisStore = undefined;
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
  if (store) await store.close();
}

export async function checkRateLimit(
  key: string,
  capacity: number,
  refillPerMinute: number,
): Promise<boolean> {
  const fullKey = namespacedKey(key);
  const refillPerMs = refillPerMinute / 60_000;
  const fromMemory = () =>
    memory.takeToken(fullKey, { capacity, refillPerMs, now: Date.now(), ttlMs: 0 });
  if (breakerIsOpen()) return fromMemory();

  const redis = await getRedis();
  if (!redis) return fromMemory();

  const now = Date.now();
  const ttlMs = Math.max(60_000, Math.ceil(capacity / refillPerMs) * 2);

  const pending = redis
    .takeToken(fullKey, { capacity, refillPerMs, now, ttlMs })
    .then((allowed) => {
      recordSuccess();
      return allowed;
    })
    .catch((e: Error) => {
      recordFailure();
      if (process.env.RATE_LIMIT_DEBUG) {
        console.error("[rate-limit] redis eval failed, in-memory fallback:", e.message);
      }
      return null; // null = "no answer from the shared store"
    });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), EVAL_DEADLINE_MS);
  });

  const res = await Promise.race([pending, deadline]);
  if (timer) clearTimeout(timer);
  if (res === null) return fromMemory();
  return res;
}

export function rateLimitKey(key: string): string {
  return namespacedKey(key);
}

export function __resetRateLimiterForTests(): void {
  if (redisStore) redisStore.disconnect();
  redisStore = undefined;
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
  memory.clear();
}

export { trustedClientIp } from "./client-ip";
