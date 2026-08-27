import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const here = path.dirname(fileURLToPath(import.meta.url));

const EDURA_ENV = process.env.EDURA_ENV;
const envFile = EDURA_ENV === "production" ? ".env.production" : ".env.local";
loadEnv({ path: path.join(here, envFile) });

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

// `env()` THROWS when the variable is absent, and this config is loaded by
// every prisma invocation — including `prisma generate`, which is this
// package's postinstall and therefore runs on every `bun install`. Generating
// a client reads the schema and touches no database, so declaring the
// datasource unconditionally made merely INSTALLING the repo require a
// production-shaped connection string. Nothing in CI has one at install time:
// the workflow supplies DIRECT_URL to the build step, so `bun install
// --frozen-lockfile` failed on the first line of the first job, CI went red,
// and the Deploy workflow — which only ships on green CI — skipped every run.
// main carried code production never received. A fresh clone failed the same
// way, for the same reason.
//
// So resolve it only when it is actually there. The commands that genuinely
// need a connection (migrate, db, studio) still get it, and when it is missing
// they fail with Prisma's own error naming the missing datasource rather than
// this file throwing before the command is even chosen.
const directUrl = process.env.DIRECT_URL;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
