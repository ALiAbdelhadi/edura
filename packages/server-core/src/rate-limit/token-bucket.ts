// Rate limiter (M3). A shared Redis store keeps limits consistent across
// instances and across restarts; when REDIS_URL is unset (local dev) or Redis
// errors, it degrades gracefully to a per-process in-memory bucket.
//
// Keys are namespaced per environment (`rl:<env>:<key>`) so that one Redis
// instance serving several environments keeps their buckets disjoint — see
// `envNamespace` below.
import type { Redis } from "ioredis";

// ---------------------------------------------------------------------------
// In-memory fallback (per-process) — local dev + graceful degrade.
// ---------------------------------------------------------------------------

type Bucket = { tokens: number; lastRefill: number };
const buckets = new Map<string, Bucket>();

function checkRateLimitMemory(key: string, capacity: number, refillPerMinute: number): boolean {
  const now = Date.now();
  const refillPerMs = refillPerMinute / 60_000;

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
}

setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [key, bucket] of buckets) {
    if (bucket.lastRefill < cutoff) buckets.delete(key);
  }
}, 5 * 60_000).unref();

// ---------------------------------------------------------------------------
// Shared store (Redis / Upstash over TCP) — lazy + optional.
// ---------------------------------------------------------------------------

// Atomic token bucket in one round-trip. Refills continuously (tokens/ms),
// consumes one token, self-expires when idle. Returns 1 (allowed) or 0.
const BUCKET_LUA = `
local capacity = tonumber(ARGV[1])
local refillPerMs = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refillPerMs)
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], ttl)
return allowed
`;

// ---------------------------------------------------------------------------
// Environment namespace.
//
// One Redis instance is shared by more than one environment — dev and
// production were found pointing at the SAME `REDIS_URL`, which meant a
// developer's failed logins consumed the bucket of a real user with the same
// email, and a local load test could throttle production. Keys are therefore
// namespaced by environment, so the stores are disjoint even on one instance.
//
// `EDURA_ENV` is the project's existing environment identifier (see
// packages/database/scripts/load-env.ts). It is a tooling variable and is not
// necessarily set in a deployed app, so the fallback has to be right on its
// own: NODE_ENV is "production" only in a real deployment, and anything else
// (next dev, tests) is treated as dev. Production and a laptop therefore never
// share a namespace even if nobody sets EDURA_ENV anywhere.
//
// Read per call rather than memoised so tests can switch environments.
// ---------------------------------------------------------------------------
function envNamespace(): string {
  const explicit = process.env.EDURA_ENV?.trim();
  if (explicit) return explicit;
  return process.env.NODE_ENV === "production" ? "production" : "dev";
}

/** Fully-qualified key: `rl:<env>:<caller key>`. */
function namespacedKey(key: string): string {
  return `rl:${envNamespace()}:${key}`;
}

// undefined = not yet initialised, null = disabled (no URL / init failed).
let redisClient: Redis | null | undefined;

async function getRedis(): Promise<Redis | null> {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    const { default: RedisCtor } = await import("ioredis");
    const client = new RedisCtor(url, {
      maxRetriesPerRequest: 2,
      // Fail fast to the in-memory fallback rather than hang a request.
      connectTimeout: 3000,
    });
    client.on("error", (e: Error) => {
      console.error("[rate-limit] redis error:", e.message);
    });
    redisClient = client;
    return client;
  } catch (e) {
    console.error("[rate-limit] redis init failed, using in-memory:", (e as Error).message);
    redisClient = null;
    return null;
  }
}

/**
 * Consume one token from the bucket `key` (capacity + refillPerMinute). Returns
 * true if allowed. Uses the shared Redis store when REDIS_URL is set (limits
 * hold across instances/restarts); otherwise a per-process in-memory bucket.
 * Redis errors degrade to in-memory rather than failing the request.
 */
export async function checkRateLimit(
  key: string,
  capacity: number,
  refillPerMinute: number,
): Promise<boolean> {
  // Namespaced once, here, so the Redis path and the in-memory fallback can
  // never disagree about which bucket a caller is consuming.
  const fullKey = namespacedKey(key);
  const redis = await getRedis();
  if (!redis) return checkRateLimitMemory(fullKey, capacity, refillPerMinute);

  const refillPerMs = refillPerMinute / 60_000;
  const now = Date.now();
  // Live long enough to fully refill, then it is safe to evict (back to full).
  const ttl = Math.max(60_000, Math.ceil(capacity / refillPerMs) * 2);
  try {
    const res = await redis.eval(BUCKET_LUA, 1, fullKey, capacity, refillPerMs, now, ttl);
    return Number(res) === 1;
  } catch (e) {
    console.error("[rate-limit] redis eval failed, in-memory fallback:", (e as Error).message);
    return checkRateLimitMemory(fullKey, capacity, refillPerMinute);
  }
}

/** The key `checkRateLimit` would use — for tests and operational tooling. */
export function rateLimitKey(key: string): string {
  return namespacedKey(key);
}

// Test-only: reset the lazy client (lets a test point at a fresh REDIS_URL).
export function __resetRateLimiterForTests(): void {
  if (redisClient) redisClient.disconnect();
  redisClient = undefined;
  buckets.clear();
}

// ---------------------------------------------------------------------------
// Trusted client IP (M3) — do NOT trust the leftmost, client-spoofable XFF hop.
// ---------------------------------------------------------------------------

/**
 * Resolve the real client IP for rate-limit keying.
 *  - TRUSTED_CLIENT_IP_HEADER (e.g. cf-connecting-ip / true-client-ip): if set
 *    and present, used directly (platform-verified).
 *  - Otherwise the X-Forwarded-For entry TRUSTED_PROXY_HOPS from the RIGHT
 *    (default 1). Each trusted reverse proxy appends one entry on the right, so
 *    everything further left is client-supplied and ignored — a spoofed
 *    leftmost XFF can no longer forge a distinct key.
 *
 * Takes a header getter so it works with both `Headers` (Request) and
 * NextAuth's plain lowercased header record.
 */
export function trustedClientIp(getHeader: (name: string) => string | null | undefined): string {
  const verifiedHeaderName = process.env.TRUSTED_CLIENT_IP_HEADER;
  if (verifiedHeaderName) {
    const v = getHeader(verifiedHeaderName)?.trim();
    if (v) return v;
  }
  const xff = (getHeader("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length === 0) return "unknown";
  const hops = Math.max(1, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS ?? 1)) || 1);
  const idx = xff.length - hops;
  // `?? xff[0] ?? "unknown"` is type narrowing only — xff is non-empty here and
  // idx is always < xff.length, so the first operand always wins at runtime.
  // (Needed because apps/realtime typechecks this file under
  // noUncheckedIndexedAccess.)
  return (idx >= 0 ? xff[idx] : xff[0]) ?? xff[0] ?? "unknown";
}
