import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PORTAL_BY_ROLE, portalForRole, uiRoleForRole } from "@/lib/auth/portal";

const dashboardDir = fileURLToPath(
  new URL("../../src/app/[locale]/dashboard/", import.meta.url),
);

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
    const m = layout.match(/requirePortal\(\s*"([a-z_]+)"/);
    if (m) found[m[1]] = `/dashboard/${entry.name}`;
  }
  return found;
}

describe("account-switch routing", () => {
  const guards = guardsFromSource();

  it("finds a server gate for every hosted portal", () => {
    expect(Object.keys(guards).length).toBe(Object.keys(PORTAL_BY_ROLE).length);
  });

  it("PORTAL_BY_ROLE agrees with every deployed server gate (no drift)", () => {
    expect(guards).toEqual(PORTAL_BY_ROLE);
  });

  it("maps each role to a distinct portal", () => {
    const portals = Object.values(PORTAL_BY_ROLE);
    expect(new Set(portals).size).toBe(portals.length);
  });

  it("refuses to guess a portal for a role www does not host", () => {
    for (const role of ["super_admin", "accountant", "", "nonsense"]) {
      expect(portalForRole(role)).toBeNull();
    }
    expect(portalForRole(null)).toBeNull();
    expect(portalForRole(undefined)).toBeNull();
  });

  it("terminates in ONE hop from any portal/identity mismatch", () => {
    for (const actualRole of Object.keys(PORTAL_BY_ROLE)) {
      for (const [guardRole, currentPortal] of Object.entries(PORTAL_BY_ROLE)) {
        if (guardRole === actualRole) continue; // guard accepts, no redirect

        const target = portalForRole(actualRole);
        expect(target).not.toBe(currentPortal); // it actually moves
        expect(guards[actualRole]).toBe(target);
      }
    }
  });

  it("keeps the legacy UI role label for the display cache only", () => {
    expect(uiRoleForRole("center_admin")).toBe("admin");
    expect(uiRoleForRole("student")).toBe("student");
    expect(portalForRole("admin")).toBeNull();
  });
});
