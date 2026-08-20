import { createRequire } from "node:module";
import type { Pool as PgPool } from "pg";
import { pinSslMode } from "../src/pg-ssl";

/**
 * ============================================================================
 * THE RAW SQL POOL THE DB PROOF SUITES USE — driver-agnostic
 * ============================================================================
 * Every suite needs a connection that bypasses Prisma: to seed fixtures the
 * generated client cannot express, to read `pg_constraint`, to assert on rows
 * as the owner rather than as `edura_app`. 50 suites opened that connection by
 * hard-coding Neon's driver:
 *
 *     import { neonConfig, Pool } from "@neondatabase/serverless";
 *     neonConfig.webSocketConstructor = ws as never;
 *     const admin = new Pool({ connectionString: process.env.ADMIN_URL ... });
 *
 * That is a WebSocket client speaking Neon's protocol, so the suites could only
 * ever run against Neon. Combined with the standing fact that there is no test
 * branch (CLAUDE.md: both `.env.test` files point at DEV), the practical
 * position was that the project's own 2200-assertion safety net had nowhere
 * safe to run: against dev, or not at all. Auditing it in 2026-08 required
 * patching `@neondatabase/serverless` inside node_modules, which is not
 * something anyone should have to do to run the tests.
 *
 * The application already solved this. `createAdapter()` in
 * packages/database/src/client.ts branches on `DATABASE_DRIVER`: `pg` gives a
 * plain node-postgres pool, anything else gives the Neon serverless driver.
 * This helper is the same switch for the suites' raw connection, so
 * `DATABASE_DRIVER=pg` points the WHOLE stack — app and tests — at any ordinary
 * Postgres, including a throwaway container in CI.
 *
 * DEFAULT IS UNCHANGED. With `DATABASE_DRIVER` unset the Neon driver is used
 * exactly as before, so every existing environment behaves identically.
 *
 * `pinSslMode` is applied on both branches for the reason pg-ssl.ts gives:
 * flipping the driver must never change what TLS we get.
 *
 * NOT FOR: `tx-retry-boundary.test.ts`, which drives a deliberately broken
 * WebSocket to prove the transport-retry boundary. Its subject IS the Neon
 * driver, so it constructs its own pool and must keep doing so.
 * ============================================================================
 */

const require = createRequire(import.meta.url);

/**
 * Typed as node-postgres' `Pool` because that is the surface the suites already
 * coded against: `.query()` with loosely-typed rows, `.connect()` for the few
 * that take a client to pin a session. Neon's driver models its types on `pg`,
 * so this is the shape both branches genuinely have — and keeping it means the
 * 49 rewritten suites needed no other change.
 */
export type TestPool = PgPool;

/**
 * A raw SQL pool for a proof suite.
 *
 * Defaults to the most privileged string in scope — ADMIN_URL, falling back to
 * DIRECT_URL — because that is what every call site already asked for. Pass a
 * connection string to override (e.g. the app role, to assert a REVOKE bites).
 */
export function testPool(
  connectionString: string | undefined = process.env.ADMIN_URL ?? process.env.DIRECT_URL,
): TestPool {
  if (!connectionString) {
    throw new Error(
      "testPool: no ADMIN_URL / DIRECT_URL in the environment. Did you forget --env-file?",
    );
  }
  const pinned = pinSslMode(connectionString);

  if (process.env.DATABASE_DRIVER === "pg") {
    const { Pool } = require("pg") as typeof import("pg");
    return new Pool({ connectionString: pinned });
  }

  const { neonConfig, Pool } = require("@neondatabase/serverless");
  // Node has no global WebSocket before 22; the driver needs one supplied.
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
    neonConfig.webSocketConstructor = require("ws");
  }
  return new Pool({ connectionString: pinned }) as TestPool;
}
