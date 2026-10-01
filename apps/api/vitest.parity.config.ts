import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Parity harness: calls the SAME apps/api route modules as bare handlers (the
// Next app-route shape) and through the service stack, against the LOCAL
// edura_test database (test env), with apps/erp/.env.test as the environment —
// the file ERP's own DB suites use.
const erpDir = fileURLToPath(new URL("../erp/", import.meta.url));

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2]!.trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    out[m[1]!] = value;
  }
  return out;
}

const env = readEnvFile(`${erpDir}.env.test`);

// Refuse anything but the local test database before a single module loads.
// The label check (edura-env:test) runs again inside the suite via db-guard.
// CI's throwaway Postgres container names its database `neondb`; that name is
// accepted only there, and only on loopback.
const dbUrl = new URL(env.DATABASE_URL ?? "postgresql://missing/missing");
const allowedDbs = process.env.CI === "true" ? ["/edura_test", "/neondb"] : ["/edura_test"];
if (!["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname) || !allowedDbs.includes(dbUrl.pathname)) {
  throw new Error(
    `test:parity refuses to run: DATABASE_URL in apps/erp/.env.test points at ` +
      `${dbUrl.host}${dbUrl.pathname}, not the local edura_test database.`,
  );
}
if (env.EDURA_ENV !== "test") {
  throw new Error("test:parity refuses to run: apps/erp/.env.test must set EDURA_ENV=test");
}

export default defineConfig({
  test: {
    environment: "node",
    env,
    // test:parity and bench:parity each name their file; a bare run does both.
    include: ["tests/parity/**/*.test.ts", "tests/parity/latency.bench.ts"],
    exclude: ["node_modules/**"],
    fileParallelism: false,
    // The parity table and the latency table are the output; print them on a pass too.
    silent: false,
    reporters: ["default"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
