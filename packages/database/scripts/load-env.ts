/**
 * Shared env loading for the database CLI scripts, mirroring prisma.config.ts
 * so both paths select a database the same way:
 *
 *   (unset)              -> packages/database/.env             (dev)
 *   EDURA_ENV=test       -> packages/database/.env.test        (test)
 *   EDURA_ENV=production -> packages/database/.env.production  (production)
 *
 * dotenv never overrides variables already present in process.env, so an
 * explicit `--env-file=...` on the command line still wins over this default.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.EDURA_ENV ? `.env.${process.env.EDURA_ENV}` : ".env";

loadEnv({ path: path.join(here, "..", envFile) });

export const EDURA_ENV = process.env.EDURA_ENV ?? "dev";
