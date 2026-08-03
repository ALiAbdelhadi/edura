import { prisma } from "@repo/database";
import { rateLimiterDegraded } from "../rate-limit/token-bucket";

// =============================================================================
// /api/health — the endpoint an external uptime monitor polls.
//
// DESIGN RULES, each of which is a bug someone has shipped before:
//
// 1. THE STATUS CODE IS THE SIGNAL. A monitor reads the code, not the body. The
//    pre-existing `/api/v1/_ping` returns 200 with `db: "unreachable"` in the
//    JSON — which is invisible to every uptime service on the market. This
//    returns 503 when the database is unreachable.
//
// 2. ONLY HARD DEPENDENCIES AFFECT THE STATUS. The database is the one thing
//    whose absence makes the app useless. SMTP, Redis and the realtime server
//    are degradations, not outages — checking them here would page someone at
//    3am because a mail relay hiccuped. They are deliberately not checked.
//
//    `rateLimiter` below does NOT breach this. It is not a probe: nothing is
//    dialled, nothing can hang, nothing can fail. It reports a flag the process
//    already set while serving real traffic, so it costs nothing and adds no
//    dependency — the opposite of the 3am page rule 2 exists to prevent.
//    It also leaves the status CODE alone. A limiter serving from local memory
//    is worth seeing on a dashboard, but it is not a reason to pull an instance
//    out of rotation, which is what a 503 here would do — and pulling instances
//    during a Redis outage is how a degradation becomes an outage.
//
// 3. IT MUST BE BOUNDED. An unreachable database usually means a HANGING
//    connection, not a fast refusal. Without the race below the health check
//    hangs exactly when it is most needed, and the monitor reports a timeout
//    instead of a clean 503.
//
// 4. IT LEAKS NOTHING. No version, no commit, no env, no connection string, no
//    error text — this is unauthenticated and internet-facing. "up" or "down"
//    is the entire useful public payload; the driver error goes to the server
//    log where an operator can already see it.
// =============================================================================

/**
 * 8 seconds, and the number was measured, not guessed.
 *
 * Neon computes SCALE TO ZERO when idle. The first query after a quiet period
 * pays a cold-start cost; an initial 3s bound produced a **false 503** on a
 * warm-code/cold-database request (observed 2026-08-02), while every warm
 * request answered in 96–550ms. A monitor polling at 3am, when the database has
 * been idle precisely because nobody is using it, would have paged someone for
 * an outage that was not happening — and an alert channel people learn to
 * ignore is worse than no alert channel.
 *
 * 8s comfortably covers a Neon wake-up while still being a real bound: a
 * genuinely unreachable database is reported within 8s instead of hanging.
 * Pair it with "alert after 2 consecutive failures" on the monitor side
 * (docs/runbooks/uptime-and-status.md) and set the monitor's own request
 * timeout above this, not below it.
 */
const DB_TIMEOUT_MS = 8_000;

export type HealthStatus = "ok" | "degraded";

export type HealthBody = {
  status: HealthStatus;
  /** "up" when a trivial query returned within the timeout. */
  db: "up" | "down";
  /**
   * Where rate limits are currently being enforced.
   *
   * "shared" — the Redis store: one budget across every instance, which is what
   * C2's login limits assume. "local" — per-process memory: each instance holds
   * its OWN budget and each starts it full, so N instances multiply an
   * attacker's allowance by N. That is the exact weakness M3 existed to close,
   * and until now it could happen in production with nothing to see it by.
   *
   * "local" therefore means one of two things, and both are worth knowing:
   * REDIS_URL is unset (expected on a laptop, a misconfiguration in a
   * deployment), or it is set and the circuit breaker is open (Redis is down).
   * Alert on it in production; ignore it in dev.
   */
  rateLimiter: "shared" | "local";
  time: string;
};

async function checkDb(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("health db timeout")), DB_TIMEOUT_MS);
    });
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch (err) {
    // Logged, never returned to the caller (rule 4).
    console.error(
      `[health] database check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Build the health response. Returns the Response directly rather than going
 * through `ok()`/`fail()`: the envelope wraps payloads in `{ data: ... }`, and a
 * health endpoint's body should be exactly what a status page renders and what
 * a monitor's keyword check reads — not something nested.
 */
export async function healthResponse(): Promise<Response> {
  const dbUp = await checkDb();
  // Configured AND currently usable. Both halves matter: an unset REDIS_URL in
  // a deployment is a misconfiguration that looks identical, from the outside,
  // to Redis being down — in both cases the limits are not shared.
  const limitsShared = Boolean(process.env.REDIS_URL) && !rateLimiterDegraded();
  const body: HealthBody = {
    // DB only, deliberately (rule 2). A degraded limiter must not flip this:
    // monitors keyword-check `status`, and doing so would page for a
    // non-outage — the same mistake the 8s DB timeout was fixed to avoid.
    status: dbUp ? "ok" : "degraded",
    db: dbUp ? "up" : "down",
    rateLimiter: limitsShared ? "shared" : "local",
    time: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    // 503 is what makes a monitor alert. `Retry-After` tells a well-behaved
    // one this is transient rather than a permanent removal.
    status: dbUp ? 200 : 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // A cached health check is a lie. Every layer is told so explicitly.
      "cache-control": "no-store, no-cache, must-revalidate",
      ...(dbUp ? {} : { "retry-after": "30" }),
    },
  });
}
