/**
 * The rate limiter falls back to a per-process in-memory bucket when REDIS_URL is
 * unset. On a single long-lived server that is merely weaker; on serverless it is
 * close to no limiting at all, because every concurrent lambda holds its own bucket
 * and instances are recycled constantly. The login caps that exist to stop
 * brute-forcing a child's account would then be decorative.
 *
 * So production requires a shared store, and says so at boot rather than at the
 * moment someone is being brute-forced. This is the same posture as the other
 * production-required secrets: refuse to start, do not degrade quietly.
 */
export function assertSharedRateLimitStore(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") return;
  const url = env.REDIS_URL?.trim();
  if (!url) {
    throw new Error(
      "REDIS_URL is required in production: without it the rate limiter falls back " +
        "to per-process memory, which on serverless means the login and PII limits " +
        "do not hold. Set REDIS_URL, or run a single instance and set " +
        "ALLOW_UNSHARED_RATE_LIMIT=1 to accept the weaker guarantee deliberately.",
    );
  }
  if (!/^rediss?:\/\//.test(url)) {
    throw new Error("REDIS_URL must be a redis:// or rediss:// URL");
  }
  if (url.startsWith("redis://") && !env.ALLOW_PLAINTEXT_REDIS) {
    throw new Error(
      "REDIS_URL uses plaintext redis:// in production. Rate-limit keys carry " +
        "hashed identifiers and the connection often crosses a provider boundary, " +
        "so use rediss://, or set ALLOW_PLAINTEXT_REDIS=1 if the link is private.",
    );
  }
}
