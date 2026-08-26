import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// M8 (security audit) — the string-building raw-SQL API is banned. The last
// usage (a static query in reconcile-wallets.ts) was converted to the tagged
// template on 2026-08-26; this guard is what keeps the count at zero, because
// an API whose one call-site pattern is "concatenate SQL" only needs one
// future convenience edit to become an injection.
//
// The tagged-template `$queryRaw` stays legal everywhere: its parameters are
// bound, not concatenated.

const ROOTS = [
  join(__dirname, "../../../../apps/erp/src"),
  join(__dirname, "../../../../apps/superadmin/src"),
  join(__dirname, "../../../../apps/www/src"),
  join(__dirname, "../../../../apps/realtime/src"),
  join(__dirname, "../../../../packages/server-core/src"),
  join(__dirname, "../../../../packages/database/src"),
  join(__dirname, "../../../../packages/database/scripts"),
  join(__dirname, "../../../../packages/database/prisma"),
];

const BANNED = "$queryRawUnsafe";
const ALSO_BANNED = "$executeRawUnsafe";

function scan(dir: string, hits: string[]) {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // a root that does not exist in this checkout is fine
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "generated" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      scan(p, hits);
    } else if (/\.(ts|tsx|mts|cts|js|mjs)$/.test(name)) {
      const src = readFileSync(p, "utf8");
      if (src.includes(BANNED) || src.includes(ALSO_BANNED)) hits.push(p);
    }
  }
}

describe("M8 — no injection-shaped raw-SQL API anywhere", () => {
  it("$queryRawUnsafe / $executeRawUnsafe grep to zero across apps + packages", () => {
    const hits: string[] = [];
    for (const root of ROOTS) scan(root, hits);
    expect(hits).toEqual([]);
  });
});
