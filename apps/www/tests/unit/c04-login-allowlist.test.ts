// C-04 drift test — the two www login doors (NextAuth credentials and the
// manual POST /api/v1/auth/login) must accept EXACTLY the same set of roles,
// and the www/superadmin split must stay a clean partition of the Role enum.
//
// This is the STRUCTURAL half of the proof (the behavioural half — real
// accounts through both real doors against the live DB — is
// tests/db/c04-login-parity.test.ts). It asserts three things:
//   1. neither door declares its own allowlist any more (source-level check —
//      this is what actually caused C-04);
//   2. the shared partition covers EVERY role in schema.prisma, with no role in
//      both apps and none unclassified;
//   3. canSignIn is default-deny for anything that is not a known role.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  canSignIn,
  WWW_LOGIN_ROLES,
  SUPERADMIN_LOGIN_ROLES,
} from "@repo/server-core/auth/login-policy";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const NEXTAUTH_DOOR = read("../../src/lib/auth/options.ts");
const REST_DOOR = read("../../src/app/api/v1/auth/login/route.ts");
const SUPERADMIN_DOOR = read("../../../superadmin/src/lib/auth/options.ts");
const SCHEMA = read("../../../../packages/database/prisma/schema.prisma");

/** Every role in the Prisma enum, read from the schema itself. */
function schemaRoles(): string[] {
  const block = /enum Role \{([\s\S]*?)\n\}/.exec(SCHEMA);
  if (!block) throw new Error("enum Role not found in schema.prisma");
  return block[1]
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => line.length > 0 && /^[a-z_]+$/.test(line));
}

describe("C-04 — one shared allowlist for every login door", () => {
  it("the Role enum is fully classified: www ∪ superadmin = all roles", () => {
    const all = schemaRoles();
    expect(all.length).toBeGreaterThan(0);
    const union = new Set([...WWW_LOGIN_ROLES, ...SUPERADMIN_LOGIN_ROLES]);
    expect([...union].sort()).toEqual([...all].sort());
  });

  it("no role can sign in to both apps (a real partition, not two lists)", () => {
    const both = [...WWW_LOGIN_ROLES].filter((r) => SUPERADMIN_LOGIN_ROLES.has(r));
    expect(both).toEqual([]);
  });

  it("www accepts the six www roles — center_staff INCLUDED (the C-04 regression)", () => {
    expect([...WWW_LOGIN_ROLES].sort()).toEqual([
      "assistant",
      "center_admin",
      "center_staff",
      "parent",
      "student",
      "teacher",
    ]);
    expect(canSignIn("www", "center_staff")).toBe(true);
  });

  it("back-office staff are superadmin-only and refused by www", () => {
    expect([...SUPERADMIN_LOGIN_ROLES].sort()).toEqual(["accountant", "super_admin"]);
    expect(canSignIn("www", "super_admin")).toBe(false);
    expect(canSignIn("www", "accountant")).toBe(false);
  });

  it("www roles are refused by the superadmin app", () => {
    for (const role of WWW_LOGIN_ROLES) {
      expect(canSignIn("superadmin", role)).toBe(false);
    }
  });

  it("default-deny: unknown / empty / injected role values are refused everywhere", () => {
    for (const bogus of [
      "",
      "admin",
      "root",
      "SUPER_ADMIN",
      "center_accountant", // a CenterStaffRole, NOT a Role — must never be a login role
      "__proto__",
      "constructor",
      "toString",
      null,
      undefined,
    ] as (string | null | undefined)[]) {
      expect(canSignIn("www", bogus)).toBe(false);
      expect(canSignIn("superadmin", bogus)).toBe(false);
    }
  });

  it("no login door declares a local allowlist any more (the C-04 root cause)", () => {
    for (const [name, src] of [
      ["www NextAuth", NEXTAUTH_DOOR],
      ["www REST", REST_DOOR],
      ["superadmin NextAuth", SUPERADMIN_DOOR],
    ] as const) {
      // A local `new Set([... "teacher" ...])`-style allowlist is exactly what
      // drifted. The only role literals left in these files belong to the
      // shared module.
      expect(src, `${name} still declares WWW_ROLES/STAFF_ROLES`).not.toMatch(
        /const\s+(WWW_ROLES|STAFF_ROLES)\s*=/,
      );
      expect(src, `${name} does not consult the shared policy`).toMatch(
        /canSignIn\(\s*"(www|superadmin)"/,
      );
    }
  });

  it("H5 survives the edit: every door runs ONE unconditional bcrypt.compare", () => {
    for (const [name, src] of [
      ["www NextAuth", NEXTAUTH_DOOR],
      ["www REST", REST_DOOR],
      ["superadmin NextAuth", SUPERADMIN_DOOR],
    ] as const) {
      // The compare must be reached on every path, choosing the hash rather than
      // short-circuiting — an ineligible role must not answer faster.
      expect(src, `${name} lost the H5 dummy-hash branch`).toMatch(
        /bcrypt\.compare\([\s\S]{0,160}eligible \? \(user\.passwordHash as string\) : DUMMY_HASH/,
      );
      expect(src, `${name} lost DUMMY_HASH`).toMatch(/const DUMMY_HASH = "\$2b\$10\$/);
      // canSignIn feeds `eligible`, so the role check happens BEFORE the hash is
      // chosen but AFTER the decision to compare — never as an early return.
      expect(src, `${name} rejects on role before comparing`).not.toMatch(
        /if\s*\(\s*!canSignIn\([\s\S]{0,40}\)\s*\)\s*(return|throw)/,
      );
    }
  });

  it("each door asks for its OWN app (a door cannot be pointed at the other)", () => {
    expect(NEXTAUTH_DOOR).toMatch(/canSignIn\("www", user\.role\)/);
    expect(REST_DOOR).toMatch(/canSignIn\("www", user\.role\)/);
    expect(SUPERADMIN_DOOR).toMatch(/canSignIn\("superadmin", user\.role\)/);
    expect(NEXTAUTH_DOOR).not.toMatch(/canSignIn\("superadmin"/);
    expect(REST_DOOR).not.toMatch(/canSignIn\("superadmin"/);
    expect(SUPERADMIN_DOOR).not.toMatch(/canSignIn\("www"/);
  });
});
