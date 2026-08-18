import { describe, expect, it } from "vitest";
import {
  portalFromPath,
  resolveIntegrityAction,
} from "@/components/providers/session-integrity-guard";

// ---------------------------------------------------------------------------
// docs/reports/session-identity-mismatch.md — the client half.
//
// This rule decides whether to END somebody's session. Both directions are
// expensive and neither is visible in a screenshot:
//
//   too eager → one routing bug of ours signs a teacher out mid-lesson
//   too shy   → a parent keeps reading a screen wearing their own name while
//               the server serves someone else's account
//
// So all five branches are pinned here rather than left to a `useEffect` nobody
// can call.
// ---------------------------------------------------------------------------

describe("portalFromPath", () => {
  it("reads the portal segment out of a dashboard path, locale and all", () => {
    expect(portalFromPath("/ar/dashboard/parent/fees")).toBe("parent");
    expect(portalFromPath("/en/dashboard/admin")).toBe("admin");
    expect(portalFromPath("/ar/dashboard/teacher/attendance/today")).toBe("teacher");
  });

  it("returns null off the dashboard entirely", () => {
    // The public pages, the print routes, the login screen: none of them claim
    // an identity, so none of them can contradict one.
    expect(portalFromPath("/ar/login")).toBeNull();
    expect(portalFromPath("/ar/student-id/print")).toBeNull();
    expect(portalFromPath("/")).toBeNull();
  });
});

describe("resolveIntegrityAction", () => {
  it("ends the session on session_conflict, without consulting anything", () => {
    // The server has already refused to guess between two credentials — `me`
    // would refuse for the same reason, so there is nothing to confirm with.
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
    // A parent on the parent portal hitting a teacher-only route is OUR routing
    // bug. Signing them out would punish the reader for our mistake.
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
    // This is the incident itself: the parent portal rendered while the session
    // was a centre admin.
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
    // super_admin and accountant have no www portal at all; a www session
    // holding one is itself the anomaly.
    expect(
      resolveIntegrityAction({
        reason: "role_mismatch",
        portal: "admin",
        sessionRole: "super_admin",
      }),
    ).toBe("end-session");
  });

  it("ENDS the session when the identity could not be read", () => {
    // `me` refusing is not permission to keep rendering a name.
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

  // -------------------------------------------------------------------------
  // session_expired — the ordinary timeout, and the one that had nowhere to go.
  //
  // It used to be dispatched as `edura:auth-error`, an event with no listener
  // anywhere in the app, so an expired session left the dashboards rendering a
  // loading skeleton for ever: the request had its final answer and the screen
  // still said "fetching".
  // -------------------------------------------------------------------------

  it("ENDS the session on expiry, on any portal, without consulting anything", () => {
    // 401 IS the answer. There is no confirming read to make, because `me` is
    // exactly the call that just returned 401. `sessionRole` is therefore null
    // on this path by construction, and must not change the outcome.
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
    // The load-bearing one. The login screen itself reads `me` and is answered
    // 401, correctly, every single time it is rendered. Acting on that would
    // send the login page to the login page for ever, so a 401 is only ever
    // acted on where a portal is claiming an identity the server has denied.
    expect(
      resolveIntegrityAction({
        reason: "session_expired",
        portal: null,
        sessionRole: null,
      }),
    ).toBe("ignore");

    // Same for every other public surface: the print routes, the marketing
    // redirect, a signed-out visitor reading the public student-card page.
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
    // Defensive: even if something did hand this branch a role, expiry is
    // decided by WHERE the reader is, never by who the session used to be.
    expect(
      resolveIntegrityAction({
        reason: "session_expired",
        portal: "parent",
        sessionRole: "parent",
      }),
    ).toBe("end-session");
  });
});
