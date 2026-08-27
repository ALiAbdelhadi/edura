import { describe, expect, it } from "vitest";
import {
  portalFromPath,
  resolveIntegrityAction,
} from "@/components/providers/session-integrity-guard";

describe("portalFromPath", () => {
  it("reads the portal segment out of a dashboard path, locale and all", () => {
    expect(portalFromPath("/ar/dashboard/parent/fees")).toBe("parent");
    expect(portalFromPath("/en/dashboard/admin")).toBe("admin");
    expect(portalFromPath("/ar/dashboard/teacher/attendance/today")).toBe("teacher");
  });

  it("returns null off the dashboard entirely", () => {
    expect(portalFromPath("/ar/login")).toBeNull();
    expect(portalFromPath("/ar/student-id/print")).toBeNull();
    expect(portalFromPath("/")).toBeNull();
  });
});

describe("resolveIntegrityAction", () => {
  it("ends the session on session_conflict, without consulting anything", () => {
    expect(
      resolveIntegrityAction({
        reason: "session_conflict",
        portal: "parent",
        sessionRole: "parent",
      }),
    ).toBe("end-session");

    expect(
      resolveIntegrityAction({
        reason: "session_conflict",
        portal: null,
        sessionRole: null,
      }),
    ).toBe("end-session");
  });

  it("IGNORES a role mismatch when the portal matches the session's own role", () => {
    expect(
      resolveIntegrityAction({
        reason: "role_mismatch",
        portal: "parent",
        sessionRole: "parent",
      }),
    ).toBe("ignore");
    expect(
      resolveIntegrityAction({
        reason: "role_mismatch",
        portal: "admin",
        sessionRole: "center_admin",
      }),
    ).toBe("ignore");
    expect(
      resolveIntegrityAction({
        reason: "role_mismatch",
        portal: "staff",
        sessionRole: "center_staff",
      }),
    ).toBe("ignore");
  });

  it("ENDS the session when the portal belongs to a different role", () => {
    expect(
      resolveIntegrityAction({
        reason: "role_mismatch",
        portal: "parent",
        sessionRole: "center_admin",
      }),
    ).toBe("end-session");
    expect(
      resolveIntegrityAction({
        reason: "role_mismatch",
        portal: "teacher",
        sessionRole: "student",
      }),
    ).toBe("end-session");
  });

  it("ENDS the session for a back-office role loose in www", () => {
    expect(
      resolveIntegrityAction({
        reason: "role_mismatch",
        portal: "admin",
        sessionRole: "super_admin",
      }),
    ).toBe("end-session");
  });

  it("ENDS the session when the identity could not be read", () => {
    expect(
      resolveIntegrityAction({
        reason: "role_mismatch",
        portal: "parent",
        sessionRole: null,
      }),
    ).toBe("end-session");
  });

  it("IGNORES a role mismatch off the dashboard", () => {
    expect(
      resolveIntegrityAction({
        reason: "role_mismatch",
        portal: null,
        sessionRole: "parent",
      }),
    ).toBe("ignore");
  });

  it("ENDS the session on expiry, on any portal, without consulting anything", () => {
    for (const portal of ["student", "parent", "teacher", "admin", "staff", "assistant"]) {
      expect(
        resolveIntegrityAction({
          reason: "session_expired",
          portal,
          sessionRole: null,
        }),
      ).toBe("end-session");
    }
  });

  it("IGNORES expiry off the dashboard — THE LOOP GUARD", () => {
    expect(
      resolveIntegrityAction({
        reason: "session_expired",
        portal: null,
        sessionRole: null,
      }),
    ).toBe("ignore");

    expect(portalFromPath("/ar/login")).toBeNull();
    expect(portalFromPath("/ar/c/G7K3M2QF-1-ABC")).toBeNull();
    expect(
      resolveIntegrityAction({
        reason: "session_expired",
        portal: portalFromPath("/ar/login"),
        sessionRole: null,
      }),
    ).toBe("ignore");
  });

  it("does not let a stale role read override an expiry", () => {
    expect(
      resolveIntegrityAction({
        reason: "session_expired",
        portal: "parent",
        sessionRole: "parent",
      }),
    ).toBe("end-session");
  });
});
