import { describe, expect, it } from "vitest";
import {
  isAuthenticatedArea,
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

describe("isAuthenticatedArea", () => {
  it("recognises signed-in surfaces that live outside /dashboard", () => {
    expect(isAuthenticatedArea("/ar/onboarding")).toBe(true);
    expect(isAuthenticatedArea("/en/claim")).toBe(true);
    expect(isAuthenticatedArea("/ar/receipts/abc-123")).toBe(true);
    expect(isAuthenticatedArea("/ar/student-id/print")).toBe(true);
  });

  it("leaves genuinely anonymous pages alone", () => {
    expect(isAuthenticatedArea("/ar/login")).toBe(false);
    expect(isAuthenticatedArea("/ar/register")).toBe(false);
    expect(isAuthenticatedArea("/ar/guardian/verify")).toBe(false);
    expect(isAuthenticatedArea("/ar/contact")).toBe(false);
    expect(isAuthenticatedArea("/")).toBe(false);
  });

  it("does not match a path that merely starts with the same letters", () => {
    expect(isAuthenticatedArea("/ar/claiming-guide")).toBe(false);
    expect(isAuthenticatedArea("/ar/onboarding-help")).toBe(false);
  });
});

describe("resolveIntegrityAction — signed-in areas off the dashboard", () => {
  it("ends the session on a 401 during claim or onboarding", () => {
    expect(
      resolveIntegrityAction({
        reason: "session_expired",
        portal: null,
        sessionRole: null,
        authenticatedArea: true,
      }),
    ).toBe("end-session");
  });

  it("still ignores a 401 on an anonymous page", () => {
    expect(
      resolveIntegrityAction({
        reason: "session_expired",
        portal: null,
        sessionRole: null,
        authenticatedArea: false,
      }),
    ).toBe("ignore");
  });
});
