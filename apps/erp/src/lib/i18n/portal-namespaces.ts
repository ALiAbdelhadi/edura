// The translation namespaces each portal's CLIENT components can render, on top
// of the base set the root layout already provides.
//
// Why a list at all: `dashboard/layout.tsx` used to pass the whole dictionary
// (192 KB -- every portal's strings plus the marketing site's) to every
// dashboard page. Measured 2026-09-20: that prop was 211 KB of a 330 KB page and
// ~17% of the CPU one page render costs
// (docs/reports/load-test-2026-09-20.md §4.2).
//
// DO NOT EDIT THIS BY FEEL. A namespace missing here does not throw: it prints a
// raw key ("teacher.attendance.title") on an operator's screen.
// `tests/unit/i18n-portal-scope.test.ts` walks each portal's import graph and
// fails when code reachable from a portal uses a namespace its list lacks -- when
// it goes red, add the namespace it names. `bun run scripts/i18n-portal-scope.ts`
// prints the computed lists and `--why <portal> <namespace>` names the files.
//
// What counts as "can render": only the CLIENT import graph -- files that declare
// "use client" and everything they import. A server component resolves its strings
// against the full dictionary on the server and never reads this provider.
//
// Keeping these lists short is a property of the CODE, not of this file: a card
// imported by a screen all six portals mount reaches all six. That is why the
// settings screen takes its role cards as a slot (features/settings/portal-settings/)
// instead of importing them -- importing the teacher's attendance card there put
// 24 KB of teacher strings on every student's page.
export const PORTAL_NAMESPACES = {
  admin: [
    "activation", "adminHome", "adminManage", "centerAudit", "centerProfile", "dataRights",
    "onboarding", "publicHandle", "receipt", "shared", "studentBrowse", "teacher",
  ],
  staff: [
    "activation", "adminHome", "adminManage", "dataRights", "receipt", "shared",
    "studentBrowse",
  ],
  teacher: [
    "dataRights", "publicHandle", "shared", "studentBrowse", "teacher",
  ],
  assistant: [
    "assistant", "dataRights", "shared", "studentBrowse", "teacher",
  ],
  student: [
    "dataRights", "receipt", "shared", "studentBrowse", "studentClass", "studentDashboard",
    "studentDiscovery", "studentEmulator", "studentFamilyCode", "studentIdCard",
    "studentMaterials", "studentReviews", "studentSubjects", "studentSubscriptions",
    "studentTour", "studentWallet",
  ],
  parent: [
    "dataRights", "parentAttendance", "parentChild", "parentDashboard", "parentEmulator",
    "parentFees", "parentLinking", "parentOversight", "parentPay", "parentProgress",
    "parentSubscriptions", "parentTour", "parentWallet", "receipt", "shared",
    "studentClass", "studentIdCard",
  ],
} as const satisfies Record<string, readonly string[]>;

export type PortalName = keyof typeof PORTAL_NAMESPACES;
