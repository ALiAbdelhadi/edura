import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The teacher twin of `m15-one-suspension-path`, and the reason it exists is
 * the same: bringing Teacher to parity with Center was an obvious place to
 * write a SECOND way to suspend an account.
 *
 * A teacher IS a `users` row, so the ACTIVE <-> SUSPENDED transition already
 * had exactly one implementation — `setUserSuspended` in `admin-users.ts`,
 * which refuses self-suspension, refuses a blacklisted account, requires a
 * reason, writes the `user.suspended` / `user.reinstated` audit and bumps
 * `token_version` so the `users_revoke_sessions` trigger fires.
 *
 * `POST /admin/teachers/[id]/status` is a second DOOR onto that one mechanism:
 * `setTeacherStatus` checks the target really is a teacher and then delegates.
 * These tests are what stops it quietly growing a writer of its own.
 */

const SRC = join(process.cwd(), "src");
const BACKOFFICE = join(process.cwd(), "..", "..", "packages", "server-core", "src", "backoffice");

function serviceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts")) out.push(full);
    }
  };
  walk(BACKOFFICE);
  return out;
}

/** Every `tx.user.update(...)`/`updateMany(...)` whose payload sets a status. */
function userStatusWriters(): { file: string; value: string }[] {
  const hits: { file: string; value: string }[] = [];
  const call = /tx\.user\.(?:update|updateMany)\(\s*\{/g;

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
      if (status) {
        hits.push({
          file: relative(BACKOFFICE, file),
          value: status[2] ?? status[3] ?? "",
        });
      }
    }
  }
  return hits;
}

const teacherControl = readFileSync(
  join(BACKOFFICE, "admin", "teacher-control.ts"),
  "utf8",
);

describe("one path in and out of teacher suspension", () => {
  it("teacher-control.ts writes users.status nowhere", () => {
    const offenders = userStatusWriters().filter((h) =>
      h.file.endsWith("admin/teacher-control.ts"),
    );
    expect(offenders).toEqual([]);
  });

  it("setTeacherStatus delegates to setUserSuspended", () => {
    expect(teacherControl).toMatch(
      /import \{ setUserSuspended \} from "\.\/admin-users"/,
    );
    const fn = /export async function setTeacherStatus\([\s\S]*?\n\}/.exec(teacherControl);
    expect(fn).not.toBeNull();
    expect(fn![0]).toMatch(/setUserSuspended\(actor, teacherUserId, action === "deactivate"/);
    // Nothing else in that function may touch the database directly.
    expect(fn![0]).not.toMatch(/tx\.user\.update/);
  });

  it("does not let the teacher profile editor reach status, role or attendance mode", () => {
    const account = /TEACHER_ACCOUNT_FIELDS = \[([\s\S]*?)\] as const;/.exec(teacherControl);
    const profile = /TEACHER_PROFILE_FIELDS = \[([\s\S]*?)\] as const;/.exec(teacherControl);
    expect(account).not.toBeNull();
    expect(profile).not.toBeNull();
    for (const list of [account![1], profile![1]]) {
      expect(list).not.toMatch(/["']status["']/);
      expect(list).not.toMatch(/["']role["']/);
      expect(list).not.toMatch(/["']attendanceMode["']/);
      expect(list).not.toMatch(/["']systemStatus["']/);
      expect(list).not.toMatch(/["']walletBalance["']/);
    }
  });

  it("the PATCH route's schema cannot carry status or role", () => {
    const route = readFileSync(
      join(SRC, "routes", "v1", "admin", "teachers", "[id]", "route.ts"),
      "utf8",
    );
    const schema = /const patchSchema = z[\s\S]*?\.strict\(\);/.exec(route);
    expect(schema).not.toBeNull();
    expect(schema![0]).not.toMatch(/\bstatus:/);
    expect(schema![0]).not.toMatch(/\brole:/);
    // `.strict()` is what turns an unknown key into a 422 instead of a silent
    // no-op, so its absence is the bug this asserts against.
    expect(schema![0]).toMatch(/\.strict\(\)/);
  });

  it("the create route cannot ask for a role", () => {
    const route = readFileSync(
      join(SRC, "routes", "v1", "admin", "teachers", "route.ts"),
      "utf8",
    );
    const schema = /const createSchema = z[\s\S]*?\.strict\(\);/.exec(route);
    expect(schema).not.toBeNull();
    expect(schema![0]).not.toMatch(/\brole:/);
    expect(schema![0]).not.toMatch(/\bstatus:/);
    // The role is pinned in the service instead.
    expect(teacherControl).toMatch(/role: "teacher"/);
  });

  it("the status route requires a reason in both directions", () => {
    const route = readFileSync(
      join(SRC, "routes", "v1", "admin", "teachers", "[id]", "status", "route.ts"),
      "utf8",
    );
    // `setUserSuspended` demands a reason to reinstate as well as to suspend,
    // so an `.optional()` here would be a 422 the operator cannot see.
    expect(route).toMatch(/reason: z\.string\(\)\.trim\(\)\.min\(1\)/);
    expect(route).not.toMatch(/reason:[^\n]*optional/);
  });
});
