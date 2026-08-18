// Proof for the account-switch redirect trap.
//
// Switching accounts on one device (a student and a parent sharing a phone is
// the normal case here) used to strand the user on a spinner: the role router
// at /dashboard resolved the portal from a CACHED role in localStorage, while
// each portal's RoleGuard resolved it from the SERVER session. When those two
// disagreed the router sent the user to /dashboard/<cached>, that portal's
// guard sent them back to /dashboard, and it never terminated.
//
// The fix makes the server session the only routing authority and gives both
// sides ONE map (`portalForRole`). The invariants below are what keep the loop
// structurally impossible, so they are asserted rather than eyeballed:
//   1. the map and the guards can never drift apart (read from the real files);
//   2. a rejected identity is redirected to a portal that ACCEPTS it, so a
//      mismatch always terminates in one hop instead of ping-ponging.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PORTAL_BY_ROLE, portalForRole, uiRoleForRole } from "@/lib/auth/portal";

const dashboardDir = fileURLToPath(
  new URL("../../src/app/[locale]/dashboard/", import.meta.url),
);

/**
 * The guard mapping AS DEPLOYED: every `<RoleGuard allowedRole="X">` paired
 * with the portal folder whose layout declares it. Read from the source rather
 * than restated, so adding a portal without wiring its role fails here.
 */
function guardsFromSource(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const entry of readdirSync(dashboardDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let layout: string;
    try {
      layout = readFileSync(`${dashboardDir}${entry.name}/layout.tsx`, "utf8");
    } catch {
      continue; // a portal folder without its own layout guards elsewhere
    }
    const m = layout.match(/<RoleGuard\s+allowedRole="([a-z_]+)"/);
    if (m) found[m[1]] = `/dashboard/${entry.name}`;
  }
  return found;
}

describe("account-switch routing", () => {
  const guards = guardsFromSource();

  it("finds a RoleGuard for every hosted portal", () => {
    // Guards against the test silently passing because the regex stopped
    // matching after a refactor.
    expect(Object.keys(guards).length).toBe(Object.keys(PORTAL_BY_ROLE).length);
  });

  it("PORTAL_BY_ROLE agrees with every deployed RoleGuard (no drift)", () => {
    // This is the disagreement that produced the loop. If a portal's guard and
    // the router's map ever name different roles, it must fail HERE.
    expect(guards).toEqual(PORTAL_BY_ROLE);
  });

  it("maps each role to a distinct portal", () => {
    const portals = Object.values(PORTAL_BY_ROLE);
    expect(new Set(portals).size).toBe(portals.length);
  });

  it("refuses to guess a portal for a role www does not host", () => {
    // Back-office roles live in apps/superadmin. Returning null routes them to
    // /login instead of into a portal whose guard would bounce them.
    for (const role of ["super_admin", "accountant", "", "nonsense"]) {
      expect(portalForRole(role)).toBeNull();
    }
    expect(portalForRole(null)).toBeNull();
    expect(portalForRole(undefined)).toBeNull();
  });

  it("terminates in ONE hop from any portal/identity mismatch", () => {
    // The property that kills the loop: whatever portal a user lands on, if the
    // guard rejects them the redirect target is a portal whose OWN guard
    // accepts them — a fixed point, not another bounce.
    for (const actualRole of Object.keys(PORTAL_BY_ROLE)) {
      for (const [guardRole, currentPortal] of Object.entries(PORTAL_BY_ROLE)) {
        if (guardRole === actualRole) continue; // guard accepts, no redirect

        const target = portalForRole(actualRole);
        expect(target).not.toBe(currentPortal); // it actually moves
        // ...and the destination's guard accepts this identity, so the next
        // render does not redirect again.
        expect(guards[actualRole]).toBe(target);
      }
    }
  });

  it("keeps the legacy UI role label for the display cache only", () => {
    // `edura_state` stores center_admin as "admin". That label must never be
    // used for routing — portalForRole only understands DB roles.
    expect(uiRoleForRole("center_admin")).toBe("admin");
    expect(uiRoleForRole("student")).toBe("student");
    expect(portalForRole("admin")).toBeNull();
  });
});
