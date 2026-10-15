import type { KeyValueStore } from "./types";

type Entry = { value: string; expiresAt: number };
type Bucket = { tokens: number; lastRefill: number };

const BUCKET_IDLE_MS = 10 * 60_000;

export type MemoryKeyValueStore = KeyValueStore & { clear(): void };

/** Per-process store: same keys and TTLs as Redis, shared by nothing. */
export function createMemoryStore(): MemoryKeyValueStore {
  const entries = new Map<string, Entry>();
  const buckets = new Map<string, Bucket>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  }, 60_000).unref();

  setInterval(() => {
    const cutoff = Date.now() - BUCKET_IDLE_MS;
    for (const [key, bucket] of buckets) {
      if (bucket.lastRefill < cutoff) buckets.delete(key);
    }
  }, 5 * 60_000).unref();

  return {
    name: "memory",

    async get(key) {
      const hit = entries.get(key);
      return hit && hit.expiresAt > Date.now() ? hit.value : null;
    },

    async set(key, value, ttlMs) {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    },

    async incr(key) {
      const hit = entries.get(key);
      const next = Number(hit?.value ?? "0") + 1;
      entries.set(key, { value: String(next), expiresAt: hit?.expiresAt ?? Number.POSITIVE_INFINITY });
      return next;
    },

    async takeToken(key, { capacity, refillPerMs, now }) {
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: capacity, lastRefill: now };
        buckets.set(key, bucket);
      }
      const elapsed = now - bucket.lastRefill;
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
      bucket.lastRefill = now;
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },

    async close() {},

    disconnect() {},

    clear() {
      entries.clear();
      buckets.clear();
    },
  };
}
