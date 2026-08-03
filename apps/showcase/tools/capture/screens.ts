/**
 * The screen manifest — what the marketing site is allowed to show.
 *
 * Every entry maps to a route that exists in apps/www today. A screen that is
 * not in this list does not get captured, and a claim on the site that has no
 * screenshot behind it has to be carried by a diagram instead — which is the
 * point: the manifest is the link between `docs/showcase/feature-matrix.md`
 * and the pixels.
 *
 * `waitFor` is a selector or text that proves the screen actually loaded its
 * DATA, not just its shell. Without it a screenshot races the skeleton and the
 * site ends up advertising loading states.
 */

export type Role =
  | "admin"
  | "staff"
  | "teacher"
  | "assistant"
  | "student"
  | "parent";

export type Screen = {
  /** File name stem: `<key>.<locale>.png`. */
  key: string;
  /** Path after `/{locale}`. */
  path: string;
  /** Text that must be visible before the shot is taken. */
  waitForText?: string;
  /** Skip the shot if this screen is legitimately empty for the demo center. */
  note?: string;
};

/** The demo accounts the seed creates. Password is SEED_PASSWORD. */
export const ACCOUNTS: Record<Role, string> = {
  admin: "showcasedemo-marwan@edura.test",
  staff: "showcasedemo-laila@edura.test",
  teacher: "showcasedemo-hossam@edura.test",
  assistant: "showcasedemo-nour@edura.test",
  student: "showcasedemo-student-1@edura.test",
  parent: "showcasedemo-soheir@edura.test",
};

export const SCREENS: Record<Role, Screen[]> = {
  // Center owner — the /owners page draws almost entirely from here.
  admin: [
    { key: "home", path: "/dashboard/admin" },
    { key: "checkin", path: "/dashboard/admin/checkin" },
    { key: "classes", path: "/dashboard/admin/classes" },
    { key: "students", path: "/dashboard/admin/students" },
    { key: "teachers", path: "/dashboard/admin/teachers" },
    { key: "rooms", path: "/dashboard/admin/rooms" },
    { key: "staff", path: "/dashboard/admin/staff" },
    { key: "reports", path: "/dashboard/admin/reports" },
    {
      key: "fees",
      path: "/dashboard/admin/fees",
      note: "Empty until a payment flow is run by hand — the seed writes no money rows.",
    },
    { key: "expenses", path: "/dashboard/admin/expenses" },
    { key: "notes", path: "/dashboard/admin/notes" },
    { key: "enrollment-requests", path: "/dashboard/admin/enrollment-requests" },
  ],

  // Center staff — the counter. The highest-drama scene on /owners.
  staff: [
    { key: "home", path: "/dashboard/staff" },
    { key: "checkin", path: "/dashboard/staff/checkin" },
    { key: "students", path: "/dashboard/staff/students" },
    { key: "rooms", path: "/dashboard/staff/rooms" },
    { key: "reports", path: "/dashboard/staff/reports" },
    { key: "notes", path: "/dashboard/staff/notes" },
  ],

  // Teacher — /teachers. Hossam runs counter_and_door, so his portal is the
  // one that shows the two-stage register.
  teacher: [
    { key: "home", path: "/dashboard/teacher" },
    { key: "attendance", path: "/dashboard/teacher/attendance" },
    { key: "classes", path: "/dashboard/teacher/classes" },
    { key: "grades", path: "/dashboard/teacher/grades" },
    { key: "materials", path: "/dashboard/teacher/materials" },
    { key: "door", path: "/dashboard/teacher/door" },
    { key: "centers", path: "/dashboard/teacher/centers" },
    { key: "team", path: "/dashboard/teacher/team" },
    { key: "notes", path: "/dashboard/teacher/notes" },
    {
      key: "wallet",
      path: "/dashboard/teacher/wallet",
      note: "Zero balance until a session is settled by hand.",
    },
  ],

  // Assistant — the delegation strip is the thing worth showing.
  assistant: [
    { key: "home", path: "/dashboard/assistant" },
    { key: "attendance", path: "/dashboard/assistant/attendance" },
    { key: "classes", path: "/dashboard/assistant/classes" },
    { key: "grades", path: "/dashboard/assistant/grades" },
    { key: "materials", path: "/dashboard/assistant/materials" },
    { key: "door", path: "/dashboard/assistant/door" },
    { key: "notes", path: "/dashboard/assistant/notes" },
  ],

  // Student — /students.
  student: [
    { key: "home", path: "/dashboard/student" },
    { key: "subjects", path: "/dashboard/student/subjects" },
    { key: "courses", path: "/dashboard/student/courses" },
    { key: "schedule", path: "/dashboard/student/schedule" },
    { key: "grades", path: "/dashboard/student/grades" },
    { key: "materials", path: "/dashboard/student/materials" },
    { key: "attendance", path: "/dashboard/student/attendance" },
    { key: "family", path: "/dashboard/student/family" },
    {
      key: "wallet",
      path: "/dashboard/student/wallet",
      note: "CRASHES — see ASSETS-TODO. Kept so the guard keeps reporting it.",
    },
  ],

  // Guardian — /parents. Soheir has two approved children.
  parent: [
    { key: "home", path: "/dashboard/parent" },
    { key: "children", path: "/dashboard/parent/children" },
    { key: "attendance", path: "/dashboard/parent/attendance" },
    { key: "progress", path: "/dashboard/parent/progress" },
    { key: "oversight", path: "/dashboard/parent/oversight" },
    { key: "pay", path: "/dashboard/parent/pay" },
    {
      key: "fees",
      path: "/dashboard/parent/fees",
      note: "Empty until a payment flow is run by hand.",
    },
    {
      key: "wallet",
      path: "/dashboard/parent/wallet",
      note: "Zero balance until a top-up flow is run by hand.",
    },
  ],
};

export const ROLES = Object.keys(SCREENS) as Role[];

/**
 * Roles whose portal is phone-FIRST (CONSTITUTION.md §4: bottom navigation
 * instead of a sidebar). Only these get the mobile pass — capturing the center
 * owner's 166-row operator tables at 390px would produce an asset the site has
 * no honest use for, since that is not how anyone runs a center.
 */
export const MOBILE_ROLES: Role[] = ["student", "parent", "staff"];
export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
