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
const envPath = path.join(here, "..", envFile);

const loaded = loadEnv({ path: envPath });

/**
 * Refuse to run when the file we just selected disagrees with the environment
 * we were handed about WHICH DATABASE this is.
 *
 * dotenv never overwrites a variable that is already set, and `bun run` injects
 * the working directory's `.env.local` into every child process before the
 * child starts. Together those two facts mean the file chosen here can be read
 * and then silently discarded:
 *
 *     EDURA_ENV=production bun run <script>   ->  reached DEV
 *     EDURA_ENV=production npx tsx <script>   ->  reached production
 *
 * Measured 2026-08-30, and it is the mechanism behind the 2026-08-20 incident
 * where `migrate status` reported "2 migrations pending" against dev while the
 * operator believed they were looking at production. `migrate deploy` run the
 * same way would have applied them there.
 *
 * So compare the HOST — the one thing that answers "which database is this" —
 * and fail loudly rather than proceed against the wrong one. Passwords are not
 * compared: a stale one produces its own unmistakable auth error, and flagging
 * it here would block work for a difference that cannot silently corrupt.
 */
const DB_KEYS = ["DATABASE_URL", "DIRECT_URL", "ADMIN_URL"] as const;

function hostOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

if (loaded.parsed && process.env.EDURA_ALLOW_ENV_OVERRIDE !== "1") {
  const clashes = DB_KEYS.flatMap((key) => {
    const fromFile = hostOf(loaded.parsed?.[key]);
    const inEffect = hostOf(process.env[key]);
    return fromFile && inEffect && fromFile !== inEffect
      ? [{ key, fromFile, inEffect }]
      : [];
  });

  if (clashes.length > 0) {
    throw new Error(
      `load-env: REFUSING TO RUN — the environment already points at a different database.\n\n` +
        `  selected file: ${path.relative(process.cwd(), envPath)}` +
        ` (EDURA_ENV=${process.env.EDURA_ENV ?? "unset -> dev"})\n\n` +
        clashes
          .map(
            (c) =>
              `  ${c.key}\n` +
              `    the file says:   ${c.fromFile}\n` +
              `    but in effect:   ${c.inEffect}   <-- this is what would be used`,
          )
          .join("\n") +
        `\n\n` +
        `  dotenv does not overwrite a variable that is already set, so the file\n` +
        `  above was read and discarded. The usual cause is \`bun run\`, which\n` +
        `  injects the working directory's .env.local into every child process.\n\n` +
        `  Re-run with npx instead:\n` +
        `    EDURA_ENV=${process.env.EDURA_ENV ?? "production"} npx tsx <script>\n` +
        `    EDURA_ENV=${process.env.EDURA_ENV ?? "production"} npx prisma migrate deploy\n\n` +
        `  If the environment is deliberately authoritative here (CI sets these\n` +
        `  directly), set EDURA_ALLOW_ENV_OVERRIDE=1.`,
    );
  }
}

export const EDURA_ENV = process.env.EDURA_ENV ?? "dev";
