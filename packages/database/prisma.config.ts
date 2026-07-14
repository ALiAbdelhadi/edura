// =============================================================================
// Prisma 7 config — connection URLs + migrate/seed settings live here now
// (Prisma 7 disallows `url`/`directUrl` inside the datasource block, and no
// longer auto-loads .env, so we load it ourselves below).
//
// This file configures ONLY the Prisma CLI (migrate / db push / studio /
// introspect). The application runtime does NOT read it — src/client.ts wires
// its own Neon driver adapter against DATABASE_URL (the RLS-enforced pooled
// role). The CLI needs owner privileges + a session-capable connection, so it
// uses DIRECT_URL (owner role over the non-pooler host), matching the old
// datasource `directUrl`.
// =============================================================================
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(here, ".env") });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
