import type { Redis } from "ioredis";

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

function envNamespace(): string {
  const explicit = process.env.EDURA_ENV?.trim();
  if (explicit) return explicit;
  return process.env.NODE_ENV === "production" ? "production" : "dev";
}

function namespacedKey(key: string): string {
  return `rl:${envNamespace()}:${key}`;
}

let redisClient: Redis | null | undefined;

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
      connectTimeout: 5000,
    });
    client.on("error", (e: Error) => {
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

export async function closeRateLimiter(): Promise<void> {
  const client = redisClient;
  redisClient = undefined;
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
  if (client) await client.quit().catch(() => client.disconnect());
}

export async function checkRateLimit(
  key: string,
  capacity: number,
  refillPerMinute: number,
): Promise<boolean> {
  const fullKey = namespacedKey(key);
  if (breakerIsOpen()) return checkRateLimitMemory(fullKey, capacity, refillPerMinute);

  const redis = await getRedis();
  if (!redis) return checkRateLimitMemory(fullKey, capacity, refillPerMinute);

  const refillPerMs = refillPerMinute / 60_000;
  const now = Date.now();
  const ttl = Math.max(60_000, Math.ceil(capacity / refillPerMs) * 2);

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

export function rateLimitKey(key: string): string {
  return namespacedKey(key);
}

export function __resetRateLimiterForTests(): void {
  if (redisClient) redisClient.disconnect();
  redisClient = undefined;
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
  buckets.clear();
}

const MAX_IP_LEN = 45; // an IPv6 address with an embedded IPv4 tail is 45 chars
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_CHARS = /^[0-9a-f:.]+$/i;

// The value reaches a Redis key, `audit_logs.ip_address` and
// `contact_submissions.ip`, and every byte of it came from a header. Anything
// that is not an IP is not evidence and must not be stored as if it were: an
// unbounded string is an unbounded key, and free text in an audit column is log
// poisoning. Returns null for anything that does not parse.
function normalizeIp(raw: string | null | undefined): string | null {
  let v = raw?.trim() ?? "";
  if (!v || v.length > MAX_IP_LEN + 8) return null;
  const bracketed = /^\[(.+)\](?::\d{1,5})?$/.exec(v)?.[1];
  if (bracketed) v = bracketed;
  else if (v.includes(":")) {
    const head = v.split(":")[0] ?? "";
    if (IPV4.test(head)) v = head;
  }
  if (v.length > MAX_IP_LEN) return null;
  if (IPV4.test(v)) {
    return v.split(".").every((o) => Number(o) <= 255) ? v : null;
  }
  if (v.includes(":") && IPV6_CHARS.test(v)) return v.toLowerCase();
  return null;
}

/**
 * The client IP, as the limiter and the audit log are allowed to believe it.
 *
 * SECURITY_AUDIT.md L-12 fixed the SELECTION (which XFF entry to read). What it
 * could not fix is that `x-forwarded-for` is a client-writable header whose
 * trustworthiness is borrowed entirely from the edge in front of the app: with
 * TRUSTED_PROXY_HOPS=1 the code reads the LAST entry and is only correct while
 * the edge APPENDS. A platform that forwards a client-supplied XFF unchanged
 * turns every per-IP limit into one the attacker steers by rotating a header.
 *
 * So a platform header the edge sets itself wins whenever one exists, before any
 * XFF arithmetic is done: `TRUSTED_CLIENT_IP_HEADER` if the deployment names one,
 * then Vercel's own `x-vercel-forwarded-for` when running there. XFF is the last
 * resort, not the first reading.
 */
export function trustedClientIp(getHeader: (name: string) => string | null | undefined): string {
  const verifiedHeaderName = process.env.TRUSTED_CLIENT_IP_HEADER?.trim();
  if (verifiedHeaderName) {
    const v = normalizeIp(getHeader(verifiedHeaderName));
    if (v) return v;
  }
  if (process.env.VERCEL) {
    const v = normalizeIp(getHeader("x-vercel-forwarded-for"));
    if (v) return v;
  }
  const xff = (getHeader("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length === 0) return "unknown";
  const hops = Math.max(1, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS ?? 1)) || 1);
  const idx = xff.length - hops;
  // Deliberately NOT falling through to another entry when the trusted position
  // holds something unparseable: the entries an attacker controls are exactly the
  // ones a fallback would reach.
  return normalizeIp(idx >= 0 ? xff[idx] : xff[0]) ?? "unknown";
}
