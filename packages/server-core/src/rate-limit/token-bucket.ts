
type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  capacity: number,
  refillPerMinute: number,
): boolean {
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
