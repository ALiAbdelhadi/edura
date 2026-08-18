// The role-pair matrix + the default-deny shape of the EDGES table, pinned.
//
// These are PURE assertions (no DB): they guard the two tables that decide who
// may message whom, so a careless edit to either shows up as a failing test
// rather than as a quietly widened messaging surface in production.
import { describe, expect, it } from "vitest";
import {
  CONVERSATION_INITIATION,
  conversationInitiationMode,
} from "@repo/database/chat-policy";
import { reachableRoles } from "@repo/database/chat-scope";
import { isMinorFromProfile, ADULT_ROLES, isAdultRole } from "@repo/database/chat-minors";
import type { Role } from "@repo/database";

const ALL_ROLES: Role[] = [
  "super_admin",
  "accountant",
  "center_admin",
  "center_staff",
  "teacher",
  "assistant",
  "parent",
  "student",
];

/** The complete, intended matrix. Anything absent must be denied. */
const EXPECTED: Record<Role, Role[]> = {
  student: ["teacher", "assistant", "center_admin", "center_staff"],
  parent: ["teacher", "assistant", "center_admin", "center_staff"],
  teacher: ["assistant", "student", "parent", "center_admin", "center_staff"],
  assistant: ["teacher", "student", "parent", "center_admin", "center_staff"],
  center_admin: ["teacher", "assistant", "student", "parent"],
  center_staff: ["teacher", "assistant", "student", "parent"],
  super_admin: [],
  accountant: [],
};

describe("conversation matrix", () => {
  it("matches the intended table for every role pair", () => {
    for (const from of ALL_ROLES) {
      for (const to of ALL_ROLES) {
        const allowed = conversationInitiationMode(from, to) !== null;
        expect(
          allowed,
          `${from} -> ${to} should be ${EXPECTED[from].includes(to) ? "allowed" : "denied"}`,
        ).toBe(EXPECTED[from].includes(to));
      }
    }
  });

  it("denies back-office roles any conversation at all", () => {
    // Super-admin live chat is dropped (approved decision #1) — they observe
    // the log, they are never participants.
    expect(Object.keys(CONVERSATION_INITIATION.super_admin)).toHaveLength(0);
    expect(Object.keys(CONVERSATION_INITIATION.accountant)).toHaveLength(0);
    expect(reachableRoles("super_admin")).toHaveLength(0);
    expect(reachableRoles("accountant")).toHaveLength(0);
  });

  it("denies nobody-to-self and unknown roles (default-deny)", () => {
    for (const r of ALL_ROLES) {
      expect(conversationInitiationMode(r, r), `${r} -> ${r}`).toBeNull();
    }
    const unknown = "future_role" as unknown as Role;
    expect(conversationInitiationMode(unknown, "student")).toBeNull();
    expect(reachableRoles(unknown)).toHaveLength(0);
  });

  it("keeps the EDGES table and the matrix in agreement", () => {
    // reachableRoles() already intersects the two; this asserts the edge table
    // covers every pair the matrix permits, so no allowed pair is unreachable
    // for lack of a relationship rule.
    for (const from of ALL_ROLES) {
      expect([...reachableRoles(from)].sort()).toEqual([...EXPECTED[from]].sort());
    }
  });

  it("no pair is escalation-mode after the direct-teacher decision", () => {
    for (const from of ALL_ROLES) {
      for (const to of ALL_ROLES) {
        const mode = conversationInitiationMode(from, to);
        if (mode) expect(mode, `${from} -> ${to}`).toBe("open");
      }
    }
  });
});

describe("default-minor rule", () => {
  const verified = new Date("2026-01-01T00:00:00Z");
  const now = new Date("2026-07-22T00:00:00Z");

  it("treats a missing profile as a minor", () => {
    expect(isMinorFromProfile(null, now)).toBe(true);
    expect(isMinorFromProfile(undefined, now)).toBe(true);
  });

  it("treats a missing date of birth as a minor", () => {
    expect(
      isMinorFromProfile({ dateOfBirth: null, dateOfBirthVerifiedAt: verified }, now),
    ).toBe(true);
  });

  it("treats an UNVERIFIED date of birth as a minor, however old it claims to be", () => {
    expect(
      isMinorFromProfile(
        { dateOfBirth: new Date("1970-01-01"), dateOfBirthVerifiedAt: null },
        now,
      ),
    ).toBe(true);
  });

  it("treats a verified under-18 as a minor", () => {
    expect(
      isMinorFromProfile(
        { dateOfBirth: new Date("2010-01-01"), dateOfBirthVerifiedAt: verified },
        now,
      ),
    ).toBe(true);
  });

  it("treats ONLY a verified 18+ as an adult", () => {
    expect(
      isMinorFromProfile(
        { dateOfBirth: new Date("2008-01-01"), dateOfBirthVerifiedAt: verified },
        now,
      ),
    ).toBe(false);
  });

  it("handles the exact-18 boundary by completed years", () => {
    // Turns 18 the day before `now` -> adult.
    expect(
      isMinorFromProfile(
        { dateOfBirth: new Date("2008-07-21"), dateOfBirthVerifiedAt: verified },
        now,
      ),
    ).toBe(false);
    // Turns 18 the day after `now` -> still a minor.
    expect(
      isMinorFromProfile(
        { dateOfBirth: new Date("2008-07-23"), dateOfBirthVerifiedAt: verified },
        now,
      ),
    ).toBe(true);
  });

  it("classifies adult roles for oversight", () => {
    expect([...ADULT_ROLES].sort()).toEqual(
      ["assistant", "center_admin", "center_staff", "teacher"].sort(),
    );
    expect(isAdultRole("student")).toBe(false);
    expect(isAdultRole("parent")).toBe(false);
    expect(isAdultRole(null)).toBe(false);
    expect(isAdultRole("teacher")).toBe(true);
  });
});
