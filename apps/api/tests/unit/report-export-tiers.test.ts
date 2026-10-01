import { describe, expect, it } from "vitest";
import { ACCOUNTANT, MANAGER } from "@repo/server-core/authz/center-actor";
import {
  EXPORT_TIER_ROLES,
  REPORT_EXPORTS,
} from "@repo/server-core/services/reports/report-export";

describe("export tiers mirror the report endpoints' own constants", () => {
  it("accountant tier === ACCOUNTANT", () => {
    expect([...EXPORT_TIER_ROLES.accountant].sort()).toEqual([...ACCOUNTANT].sort());
  });

  it("manager tier === MANAGER", () => {
    expect([...EXPORT_TIER_ROLES.manager].sort()).toEqual([...MANAGER].sort());
  });

  it("a manager is NOT in the accountant tier — the money split is the point", () => {
    expect(EXPORT_TIER_ROLES.accountant).not.toContain("manager");
  });

  it("a receptionist is in NO export tier", () => {
    for (const roles of Object.values(EXPORT_TIER_ROLES)) {
      expect(roles).not.toContain("receptionist");
    }
  });
});

describe("the export registry", () => {
  it("gives every report a tier and a title in both scripts", () => {
    for (const [key, def] of Object.entries(REPORT_EXPORTS)) {
      expect(def.tier, `${key} tier`).toMatch(/^(accountant|manager)$/);
      expect(def.title.ar.length, `${key} ar title`).toBeGreaterThan(0);
      expect(def.title.en.length, `${key} en title`).toBeGreaterThan(0);
    }
  });

  it("keeps the money reports on the accountant tier", () => {
    for (const key of [
      "net-profit",
      "revenue-by-course",
      "revenue-timeseries",
      "expenses-timeseries",
      "expenses",
    ] as const) {
      expect(REPORT_EXPORTS[key].tier, key).toBe("accountant");
    }
  });

  it("keeps the operational reports on the manager tier", () => {
    for (const key of ["course-fill-rates", "attendance-by-course", "enrollment-funnel"] as const) {
      expect(REPORT_EXPORTS[key].tier, key).toBe("manager");
    }
  });
});
