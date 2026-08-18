import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Re-seed the back-office fixture before every run.
 *
 * Without this the suite is ORDER-DEPENDENT in a way that bites: each test must
 * enrol 2FA (the only moment the secret is readable), and a test that fails
 * before its cleanup leaves the account enrolled — so the next RUN cannot sign
 * in at all, and the failure looks like a product bug rather than leftover
 * state. Seeding here makes every run start from the same place regardless of
 * how the last one ended.
 */
export default function globalSetup() {
  const db = path.join(process.cwd(), "..", "..", "packages", "database");
  execFileSync("bun", ["run", "tsx", "--env-file=.env", "prisma/backoffice-tour-fixture.ts"], {
    cwd: db,
    stdio: "inherit",
  });
}
