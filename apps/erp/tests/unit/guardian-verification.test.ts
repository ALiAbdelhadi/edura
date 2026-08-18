import { describe, expect, it } from "vitest";
import {
  isGuardianEmailVerified,
  maskEmail,
} from "@repo/server-core/services/invites/guardian-verification";
import { CLAIMABLE } from "@repo/server-core/services/invites/invite-token";

/**
 * The two claims this feature rests on, both checkable without a database.
 *
 *  1. A verification token can NEVER mint a session. The claim provider turns a
 *     token into a login by looking its purpose up in CLAIMABLE; a purpose that
 *     is absent from that map has no role to resolve into. If someone ever adds
 *     `guardian_email_verification` there, this test is what stops it — the
 *     consequence would be handing a session to whoever holds a child's
 *     guardian address.
 *  2. A stamp belongs to the ADDRESS it was earned by, not to the row. Editing
 *     the address must un-verify it, or a proof from one inbox is inherited by
 *     the next.
 */

describe("the verification purpose is not claimable", () => {
  it("is absent from CLAIMABLE — a token of this purpose resolves to no role", () => {
    expect(Object.keys(CLAIMABLE)).not.toContain("guardian_email_verification");
  });

  it("every claimable purpose resolves to exactly one role", () => {
    // Deliberately NOT a fixed list of purposes: that list legitimately grows
    // (teacher_invite arrived from another workstream) and pinning it here
    // would fail on somebody else's correct change. What must hold is the
    // shape — one purpose, one role — plus the absence above.
    for (const [purpose, spec] of Object.entries(CLAIMABLE)) {
      expect(typeof spec.role, purpose).toBe("string");
      expect(spec.role.length, purpose).toBeGreaterThan(0);
    }
  });
});

describe("isGuardianEmailVerified — the stamp is bound to the address", () => {
  const at = new Date("2026-08-09T10:00:00.000Z");

  it("true when the stamped value is the current address", () => {
    expect(
      isGuardianEmailVerified({
        guardianEmail: "parent@example.com",
        guardianEmailVerifiedAt: at,
        guardianEmailVerifiedValue: "parent@example.com",
      }),
    ).toBe(true);
  });

  it("FALSE when the address was edited after verification", () => {
    // The whole reason the second column exists.
    expect(
      isGuardianEmailVerified({
        guardianEmail: "someone-else@example.com",
        guardianEmailVerifiedAt: at,
        guardianEmailVerifiedValue: "parent@example.com",
      }),
    ).toBe(false);
  });

  it("false when there is a stamp but no stored value (pre-migration rows)", () => {
    expect(
      isGuardianEmailVerified({
        guardianEmail: "parent@example.com",
        guardianEmailVerifiedAt: at,
        guardianEmailVerifiedValue: null,
      }),
    ).toBe(false);
  });

  it("false for an unverified row, and for no address at all", () => {
    expect(
      isGuardianEmailVerified({ guardianEmail: "p@x.io", guardianEmailVerifiedAt: null }),
    ).toBe(false);
    expect(
      isGuardianEmailVerified({
        guardianEmail: null,
        guardianEmailVerifiedAt: at,
        guardianEmailVerifiedValue: "p@x.io",
      }),
    ).toBe(false);
  });

  it("ignores case and surrounding space — the setter lower-cases, readers must agree", () => {
    expect(
      isGuardianEmailVerified({
        guardianEmail: "parent@example.com",
        guardianEmailVerifiedAt: at,
        guardianEmailVerifiedValue: "  Parent@Example.COM ",
      }),
    ).toBe(true);
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain, hides the rest", () => {
    expect(maskEmail("mohamed@example.com")).toBe("m******@example.com");
  });

  it("does not expose a one-character local part", () => {
    expect(maskEmail("a@example.com")).toBe("a*@example.com");
  });
});
