import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalSetup() {
  const db = path.join(process.cwd(), "..", "..", "packages", "database");
  execFileSync("bun", ["run", "tsx", "--env-file=.env", "prisma/backoffice-tour-fixture.ts"], {
    cwd: db,
    stdio: "inherit",
  });
}
