import { createRequire } from "node:module";
import type { Pool as PgPool } from "pg";
import { pinSslMode } from "../src/pg-ssl";

const require = createRequire(import.meta.url);

export type TestPool = PgPool;

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
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
    neonConfig.webSocketConstructor = require("ws");
  }
  return new Pool({ connectionString: pinned }) as TestPool;
}
