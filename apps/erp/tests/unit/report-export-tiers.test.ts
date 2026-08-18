import { describe, expect, it } from "vitest";
import { ACCOUNTANT, MANAGER } from "@/lib/authz/center-actor";
import {
  EXPORT_TIER_ROLES,
  REPORT_EXPORTS,
} from "@repo/server-core/services/reports/report-export";

/**
 * DRIFT GUARD — the export must admit exactly who the report itself admits.
 *
 * The kernel cannot import apps/www's ACCOUNTANT / MANAGER constants, so it
 * restates them. Restating is fine; restating SILENTLY is not — this is the
 * test that makes the copy fail loudly if the original moves. Same pattern as
 * the chat-scope EDGES drift test.
 *
 * The asymmetry worth staring at: ACCOUNTANT is `center_accountant` ALONE. A
 * manager runs the center day to day and still may not read revenue. An
 * export endpoint that "helpfully" let managers through would hand every
 * manager the books — and it would look like a convenience, not a breach.
 */
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
    // These are the five whose own endpoints gate on ACCOUNTANT. If one moves
    // to `manager` here, that is a decision about who sees the books — it
    // should fail this test and be argued for, not slip through in a diff.
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
