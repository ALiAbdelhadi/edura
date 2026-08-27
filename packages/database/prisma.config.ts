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

const directUrl = process.env.DIRECT_URL;

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
