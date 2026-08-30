import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const VALID_ENVS = ["dev", "test", "production"] as const;

function envFileFor(name: string | undefined): string {
  if (name && !(VALID_ENVS as readonly string[]).includes(name)) {
    throw new Error(
      `EDURA_ENV="${name}" is not one of ${VALID_ENVS.join(", ")}. ` +
        "It is the ONLY input that selects a database — a typo here reaches dev " +
        "silently, so it is refused rather than defaulted.",
    );
  }
  return !name || name === "dev" ? ".env.local" : `.env.${name}`;
}

const envFile = envFileFor(process.env.EDURA_ENV);

loadEnv({ path: path.join(here, "..", envFile) });

export const EDURA_ENV = process.env.EDURA_ENV ?? "dev";
