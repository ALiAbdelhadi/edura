import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  canSignIn,
  WWW_LOGIN_ROLES,
  SUPERADMIN_LOGIN_ROLES,
} from "@repo/server-core/auth/login-policy";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const WWW_DOOR = read("../../src/lib/auth/auth.ts");
const SUPERADMIN_DOOR = read("../../../superadmin/src/lib/auth/auth.ts");
const SCHEMA = read("../../../../packages/database/prisma/schema.prisma");

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
      ["www better-auth", WWW_DOOR],
      ["superadmin better-auth", SUPERADMIN_DOOR],
    ] as const) {
      expect(src, `${name} still declares WWW_ROLES/STAFF_ROLES`).not.toMatch(
        /const\s+(WWW_ROLES|STAFF_ROLES)\s*=/,
      );
    }
    expect(WWW_DOOR).toMatch(/canSignIn\(\s*"www"/);
    expect(SUPERADMIN_DOOR).toMatch(/canSignIn\(\s*"superadmin"/);
  });

  it("H5 survives the edit: every refusal path runs the dummy bcrypt compare", () => {
    for (const [name, src] of [
      ["www better-auth", WWW_DOOR],
      ["superadmin better-auth", SUPERADMIN_DOOR],
    ] as const) {
      expect(src, `${name} lost the H5 dummy compare`).toMatch(
        /verifyPassword\(\{\s*hash:\s*DUMMY_HASH,\s*password\s*\}\)/,
      );
      expect(src, `${name} must import DUMMY_HASH from the shared module`).toMatch(
        /DUMMY_HASH[\s\S]{0,200}from "@repo\/server-core\/auth\/passwords"/,
      );
      expect(src, `${name} must not redeclare DUMMY_HASH`).not.toMatch(
        /const DUMMY_HASH\s*=/,
      );
    }
  });
});
