/* eslint-disable no-console */
/**
 * ============================================================================
 * HTTP TARGET GUARD — closes the hole db-guard structurally cannot see
 * ============================================================================
 * `db-guard` asserts the environment of the database THIS PROCESS connects to.
 * That is the right check for a suite that writes through its own connection —
 * and it is blind to a suite that writes over HTTP, because those rows travel
 * on the SERVER's connection, which the guard never observes.
 *
 * The failure is not theoretical. `apps/www/.env.test` sets
 *     WWW_BASE_URL=http://localhost:3002
 * which is whatever server happens to hold that port. On a developer machine
 * that is normally the DEV server. Reproduced 2026-08-01: running
 * `c01-lesson-settlement.test.ts` with `--env-file=.env.test` — guard green,
 * label `test` — created a center and a user in the DEV database, because its
 * first step is `POST /api/v1/auth/register` against port 3002.
 *
 * The runner's own docblock records this shape as unguardable and says the 19
 * `_*` probe scripts were REMOVED for it on 2026-07-26. Two real suites
 * (`c01-lesson-settlement`, `h03-seed-uuid-flows`) still write over HTTP, so
 * they need the check the removal was standing in for.
 *
 * WHAT THIS DOES — the same philosophy as db-guard: assert the truth of what
 * you actually reached, never trust the configuration.
 *
 *   1. Write a uniquely-named sentinel center through the suite's OWN
 *      (already db-guard'ed, therefore `test`) connection.
 *   2. Ask the SERVER for it over its public search endpoint.
 *   3. Visible  -> the server reads the same database. Proceed.
 *      Invisible -> different database. THROW, before the suite's first write.
 *
 * Zero writes reach the wrong database: the sentinel only ever exists in the
 * connection db-guard already validated, and it is removed in a `finally`.
 *
 * STATUS: no current caller. `c01-lesson-settlement` and `h03-seed-uuid-flows`
 * were converted to in-process route handlers on 2026-08-01, so no suite writes
 * over HTTP any more and the hazard is closed by construction rather than by
 * this check. It is kept, not deleted, because "no suite does HTTP" is a fact
 * about today and nothing enforces it: the moment one needs a running server
 * again, this is the guard it must call BEFORE its first write.
 *
 * Usage — call it at the TOP of main(), after assertDbEnv has run:
 *     await assertServerSharesDb(WWW, { intent: "c01 www server" });
 */
import "./load-env";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { pinSslMode } from "../src/pg-ssl";

/** Public, unauthenticated, and reflects a row we can create: the center directory. */
const PROBE_PATH = "/api/v1/search/centers";

function adminUrl(): string {
  const url =
    process.env.ADMIN_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "http-target-guard: no ADMIN_URL / DIRECT_URL / DATABASE_URL. Did you forget --env-file?",
    );
  }
  return url;
}

/**
 * Public www probe. Deliberately passes NO query parameter beyond `q`: the
 * sentinel carries an active course, so it is visible under the directory's
 * oldest semantics as well as the current ones. A probe that depended on a
 * recently-added parameter would report "wrong database" for a server that is
 * merely a few commits behind — a false refusal is as useless as no guard.
 */
async function defaultCanSee(baseUrl: string, tag: string): Promise<boolean> {
  const res = await fetch(`${baseUrl}${PROBE_PATH}?q=${encodeURIComponent(tag)}`);
  if (!res.ok) throw new Error(`${PROBE_PATH} returned ${res.status}`);
  const body = (await res.json()) as { data?: { name?: string }[] };
  return (body.data ?? []).some((c) => c.name === tag);
}

/**
 * Throws unless the server at `baseUrl` reads the same database this process is
 * connected to. Run `assertDbEnv` FIRST — this proves sameness, not safety, and
 * two processes agreeing on the wrong database is still the wrong database.
 *
 * `canSee` overrides how the server is asked. The default probe is www's public
 * center directory; a server with no public DB-backed endpoint (apps/superadmin
 * — every route is behind `requireRole`) must supply an authenticated one
 * rather than go unchecked.
 */
export async function assertServerSharesDb(
  baseUrl: string,
  opts: { intent?: string; canSee?: (tag: string) => Promise<boolean> } = {},
): Promise<void> {
  const intent = opts.intent ? ` [${opts.intent}]` : "";
  const tag = `httpguard-${Math.floor(Math.random() * 1e9).toString(36)}`;
  const pool = new pg.Pool({ connectionString: pinSslMode(adminUrl()), max: 1 });
  const sentinelUser = randomUUID();
  const sentinelCenter = randomUUID();
  const sentinelCourse = randomUUID();

  try {
    // An ACTIVE center carrying one ACTIVE course — the shape every version of
    // the directory has ever returned. The teacher exists only because
    // `courses.teacher_id` is NOT NULL.
    await pool.query(
      `INSERT INTO users (id, email, role, name, status, is_demo, created_at, updated_at)
       VALUES ($1, $2, 'teacher', 'http-target-guard sentinel', 'active', true, now(), now())`,
      [sentinelUser, `${tag}@http-target-guard.invalid`],
    );
    await pool.query(
      `INSERT INTO centers (id, name, short_id, status, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', true, now(), now())`,
      [sentinelCenter, tag, tag.slice(-8).toUpperCase()],
    );
    await pool.query(
      `INSERT INTO courses (id, center_id, teacher_id, title, subject, days_of_week,
                            start_time, end_time, start_date, price, max_students,
                            status, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'sentinel', '{1}', '16:00', '18:00', now(), 0, 1,
               'active', true, now(), now())`,
      [sentinelCourse, sentinelCenter, sentinelUser, tag],
    );

    let found: boolean;
    try {
      found = opts.canSee
        ? await opts.canSee(tag)
        : await defaultCanSee(baseUrl, tag);
    } catch (cause) {
      throw new Error(
        `http-target-guard${intent}: REFUSING TO RUN — could not ask the server at ${baseUrl}.\n` +
          `This suite writes over HTTP, so it needs a running server backed by the TEST\n` +
          `database. Start one with a test env, then point WWW_BASE_URL at its origin.\n` +
          `  cause: ${(cause as Error).message}`,
      );
    }

    if (!found) {
      throw new Error(
        `http-target-guard${intent}: REFUSING TO RUN — the server at ${baseUrl} does NOT read\n` +
          `the database this suite is connected to.\n` +
          `  A row written here is invisible there, so every HTTP write this suite makes\n` +
          `  would land in the SERVER's database — which db-guard cannot see or protect.\n` +
          `  Point WWW_BASE_URL / SUPERADMIN_BASE_URL at a server started with the TEST env.`,
      );
    }
  } finally {
    // FK order, and never let a cleanup failure mask the real error.
    for (const sql of [
      [`DELETE FROM courses WHERE id = $1`, sentinelCourse],
      [`DELETE FROM centers WHERE id = $1`, sentinelCenter],
      [`DELETE FROM users WHERE id = $1`, sentinelUser],
    ] as const) {
      await pool.query(sql[0], [sql[1]]).catch(() => {});
    }
    await pool.end();
  }
}
