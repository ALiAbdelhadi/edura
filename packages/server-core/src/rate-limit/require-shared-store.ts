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
 *
 * SECURITY_AUDIT.md L-11: `ALLOW_UNSHARED_RATE_LIMIT=1` was named in the error
 * for a month and never read. It now IS the documented escape hatch — for a
 * deliberate single-instance deploy — and logs once so nobody forgets it is on.
 *
 * SECURITY_AUDIT.md L-12: on Vercel the client IP is `x-forwarded-for[len -
 * TRUSTED_PROXY_HOPS]`; one hop off and a client-supplied XFF prefix becomes
 * "the IP" for every per-IP limiter. So on Vercel, production must say which it
 * trusts: `TRUSTED_CLIENT_IP_HEADER` (recommended: `x-vercel-forwarded-for`) or an
 * explicit `TRUSTED_PROXY_HOPS`.
 */
export function assertSharedRateLimitStore(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") return;

  if (env.VERCEL && !env.TRUSTED_CLIENT_IP_HEADER?.trim() && !env.TRUSTED_PROXY_HOPS?.trim()) {
    throw new Error(
      "On Vercel, production must name how the client IP is read or every per-IP " +
        "rate limit can be steered by the client: set " +
        "TRUSTED_CLIENT_IP_HEADER=x-vercel-forwarded-for (recommended) or an explicit " +
        "TRUSTED_PROXY_HOPS matching the proxy depth.",
    );
  }

  const url = env.REDIS_URL?.trim();
  if (!url) {
    if (env.ALLOW_UNSHARED_RATE_LIMIT === "1") {
      console.warn(
        "[rate-limit] ALLOW_UNSHARED_RATE_LIMIT=1: running with a per-process " +
          "in-memory limiter. Only acceptable on a single long-lived instance.",
      );
      return;
    }
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
