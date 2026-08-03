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

// ---------------------------------------------------------------------------
// Circuit breaker.
//
// "Fail fast to the in-memory fallback" was the stated intent, and it was NOT
// what happened. ioredis queues commands while disconnected (enableOfflineQueue
// defaults to true) and backs off between reconnects, so during an outage each
// call waited for the retry budget to drain — measured against the real login
// limits, eight consecutive checks took 13.9s and the per-call cost climbed
// 176ms -> 3304ms without bound. Sign-in consumes TWO checks (IP, then email),
// so a Redis outage stalled every login for seconds and got worse the longer it
// lasted: an availability problem manufactured by the thing protecting
// availability.
//
// After OPEN_AFTER consecutive failures the breaker opens and every call goes
// straight to memory for COOLDOWN_MS — no socket, no wait. One call is allowed
// through after the cooldown to test recovery; success closes it immediately.
// ---------------------------------------------------------------------------
const OPEN_AFTER = 3;
const COOLDOWN_MS = 30_000;
// Longest a caller will wait on the shared store before taking the local
// answer. Comfortably above a warm round-trip (~50–200ms) and above the
// measured cold connect (528–1260ms), so the normal path still uses Redis.
const EVAL_DEADLINE_MS = 1_500;
let consecutiveFailures = 0;
let breakerOpenedAt = 0;

function breakerIsOpen(): boolean {
  if (breakerOpenedAt === 0) return false;
  if (Date.now() - breakerOpenedAt >= COOLDOWN_MS) {
    // Cooldown elapsed: let ONE call through to probe recovery.
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
    // One line per outage, not one per request — an outage must be visible
    // without drowning the log in the failures that define it.
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

/** Degraded = not using the shared store. For health checks and tests. */
export function rateLimiterDegraded(): boolean {
  return breakerOpenedAt !== 0;
}

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
      maxRetriesPerRequest: 1,
      // The offline queue stays ON. Turning it off was tried and is WRONG: it
      // rejects any command issued while the socket is still connecting, so
      // every cold start failed its first calls and tripped the breaker — a
      // freshly booted instance would skip Redis entirely for 30s. The queue is
      // what makes a cold start work; the waiting is bounded below instead.
      connectTimeout: 5000,
    });
    client.on("error", (e: Error) => {
      // Connection-level noise (resets, reconnect attempts) is expected and
      // self-healing; the breaker above is what reports a real outage. Kept at
      // debug volume so a single reset does not read as an incident.
      if (process.env.RATE_LIMIT_DEBUG) console.error("[rate-limit] redis error:", e.message);
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
 * Release the shared client. The module-level client keeps the event loop
 * alive, so anything short-lived that imports this (a script, a cron job) hangs
 * on exit without it — and in `next dev` every module reload leaks a client
 * whose abandoned socket the server later resets.
 */
export async function closeRateLimiter(): Promise<void> {
  const client = redisClient;
  redisClient = undefined;
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
  if (client) await client.quit().catch(() => client.disconnect());
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
  // Breaker first: while it is open we must not touch the socket at all, which
  // is the whole point — the cost being avoided is the waiting, not the bytes.
  if (breakerIsOpen()) return checkRateLimitMemory(fullKey, capacity, refillPerMinute);

  const redis = await getRedis();
  if (!redis) return checkRateLimitMemory(fullKey, capacity, refillPerMinute);

  const refillPerMs = refillPerMinute / 60_000;
  const now = Date.now();
  // Live long enough to fully refill, then it is safe to evict (back to full).
  const ttl = Math.max(60_000, Math.ceil(capacity / refillPerMs) * 2);

  // Bound the WAIT, not the queue. A warm Upstash round-trip is ~50–200ms; a
  // cold connect is 528–1260ms and rides the offline queue. Past the deadline
  // the caller gets the in-memory answer immediately, while the command is left
  // to settle in the background purely so its outcome can feed the breaker.
  //
  // A deadline miss is NOT itself counted as a failure: on a cold start nothing
  // is wrong, the socket is merely still opening. Only a real rejection counts,
  // which is what distinguishes "slow" from "down" and is why an outage still
  // opens the breaker after OPEN_AFTER of them.
  const pending = redis
    .eval(BUCKET_LUA, 1, fullKey, capacity, refillPerMs, now, ttl)
    .then((res) => {
      recordSuccess();
      return Number(res) === 1;
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
  if (res === null) return checkRateLimitMemory(fullKey, capacity, refillPerMinute);
  return res;
}

/** The key `checkRateLimit` would use — for tests and operational tooling. */
export function rateLimitKey(key: string): string {
  return namespacedKey(key);
}

// Test-only: reset the lazy client (lets a test point at a fresh REDIS_URL).
export function __resetRateLimiterForTests(): void {
  if (redisClient) redisClient.disconnect();
  redisClient = undefined;
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
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
