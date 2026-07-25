import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

const here = path.dirname(fileURLToPath(import.meta.url));

// Which database the Prisma CLI talks to. Defaults to `.env` (dev) so the
// everyday commands are unchanged; set EDURA_ENV to target another database:
//
//   pnpm migrate:dev                                  -> .env             (dev)
//   EDURA_ENV=test       pnpm migrate:deploy          -> .env.test        (test)
//   EDURA_ENV=production pnpm migrate:deploy          -> .env.production  (prod)
//
// Each file is gitignored and holds only that database's URLs.
const EDURA_ENV = process.env.EDURA_ENV;
const envFile = EDURA_ENV ? `.env.${EDURA_ENV}` : ".env";
loadEnv({ path: path.join(here, envFile) });

// Destructive CLI verbs must never reach production. `migrate dev` and
// `migrate reset` will drop and recreate the database when they detect drift,
// and `db push` applies schema changes with no migration record at all. The
// database-side guard (scripts/db-guard.ts) covers tests and seeds; this covers
// the Prisma CLI, which reads this file on every invocation.
if (EDURA_ENV === "production") {
  const argv = process.argv.join(" ");
  const forbidden = ["migrate dev", "migrate reset", "db push", "db execute"];
  const hit = forbidden.find((verb) => argv.includes(verb));
  if (hit) {
    throw new Error(
      `prisma.config: REFUSING \`prisma ${hit}\` with EDURA_ENV=production.\n` +
        `These commands can drop data or apply unrecorded schema changes.\n` +
        `Production migrations go through \`prisma migrate deploy\` only.`,
    );
  }
}

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
