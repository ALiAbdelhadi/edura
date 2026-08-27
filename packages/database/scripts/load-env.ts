import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile =
  process.env.EDURA_ENV === "production" ? ".env.production" : ".env.local";

loadEnv({ path: path.join(here, "..", envFile) });

export const EDURA_ENV = process.env.EDURA_ENV ?? "dev";
