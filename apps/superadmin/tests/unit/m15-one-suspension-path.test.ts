import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * M-15 removed `toggleCenter`, a second way to suspend a center that took no
 * reason, wrote a thin audit and notified nobody — while `setCenterStatus`
 * required a reason, snapshotted the admins it was about to suspend, and told
 * them. Deleting it fixes today; this is what stops it coming back.
 *
 * The rule is not "nothing may write centers.status" — approve and reject are
 * distinct lifecycle transitions with their own audit. The rule is that the
 * ACTIVE <-> SUSPENDED transition has exactly one implementation.
 *
 * `blacklisted` was a third writer (`blacklistCenter`) until 2026-09-12. It had
 * no route, and nothing could lift it: `setCenterStatus` refuses to reactivate
 * out of that status, so a blacklisted centre and its suspended admins were
 * permanent. It was deleted (docs/follow-ups.md #7) — deactivating is the
 * reversible way to shut a centre down, and it is the path this test pins.
 */
function serviceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts")) out.push(full);
    }
  };
  walk(join(process.cwd(), "src", "lib", "services"));
  walk(join(process.cwd(), "..", "..", "packages", "server-core", "src", "services"));
  return out;
}

/** Every `tx.center.update(...)`/`updateMany(...)` whose payload sets a status. */
function centerStatusWriters(): { file: string; value: string }[] {
  const hits: { file: string; value: string }[] = [];
  const call = /tx\.center\.(?:update|updateMany)\(\s*\{/g;

  for (const file of serviceFiles()) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(call)) {
      let depth = 0;
      let i = m.index! + m[0].length - 1;
      const start = i;
      for (; i < src.length; i += 1) {
        if (src[i] === "{") depth += 1;
        else if (src[i] === "}" && (depth -= 1) === 0) break;
      }
      const block = src.slice(start, i + 1);
      const status = /status:\s*("(\w+)"|(\w+))/.exec(block);
      if (status) hits.push({ file, value: status[2] ?? status[3] ?? "" });
    }
  }
  return hits;
}

describe("M-15 one path in and out of center suspension", () => {
  it("writes centers.status only from the three lifecycle transitions", () => {
    const byFile = new Map<string, string[]>();
    for (const { file, value } of centerStatusWriters()) {
      const short = file.slice(file.indexOf("services"));
      byFile.set(short, [...(byFile.get(short) ?? []), value]);
    }

    expect(Object.fromEntries([...byFile].sort())).toEqual({
      // approve / reject: distinct transitions, each audited
      "services/admin/platform.ts": ["active", "rejected"],
      // the reason-required suspend/reinstate path, and the only one
      "services/admin/center-control.ts": ["next"],
    });
  });

  it("keeps `suspended` out of every service but setCenterStatus", () => {
    const offenders = centerStatusWriters()
      .filter((h) => h.value === "suspended")
      .map((h) => h.file);
    // setCenterStatus computes it as `next`, so no service should name the
    // literal — a new one that does is a second door.
    expect(offenders).toEqual([]);
  });

  it("does not let the profile editor reach status", () => {
    const src = readFileSync(
      join(process.cwd(), "src", "lib", "services", "admin", "center-control.ts"),
      "utf8",
    );
    const list = /CENTER_PROFILE_FIELDS = \[([\s\S]*?)\] as const;/.exec(src);
    expect(list).not.toBeNull();
    expect(list![1]).not.toMatch(/["']status["']/);
  });

  it("has no toggle route left to call", () => {
    const routes = join(process.cwd(), "src", "app", "api", "v1", "admin", "centers", "[id]");
    expect(readdirSync(routes)).not.toContain("toggle");
  });
});
