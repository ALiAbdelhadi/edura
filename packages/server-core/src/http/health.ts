import { prisma } from "@repo/database";

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
  const body: HealthBody = {
    status: dbUp ? "ok" : "degraded",
    db: dbUp ? "up" : "down",
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
