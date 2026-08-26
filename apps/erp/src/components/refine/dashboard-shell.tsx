"use client";

import { HeaderQuickSettings } from "@/components/ui/header-quick-settings";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useGlobalSearch } from "@/lib/api/use-global-search";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { MeResponse } from "@/lib/refine";
import { useGetIdentity, useList, useLogout } from "@refinedev/core";
import {
  AppShell,
  type NavGroup as ShellNavGroup,
  type NavItem,
} from "@repo/ui/components/app-shell";
import { useLocale, useTranslations } from "next-intl";
import React from "react";

/* ════════════════════════════════════════════════════════════════════════════
 * This file used to BE the shell — 489 lines of it, beside a 505-line twin in
 * apps/superadmin. The chrome now lives once, in @repo/ui/components/app-shell,
 * and this is the seam that hands it everything @repo/ui cannot import: this
 * app's locale-aware router, its next-intl catalogue, its refine identity and
 * data hooks, and its own header controls.
 *
 * The public shape is UNCHANGED — same default export, same `role` /
 * `navItems` / `navGroups` / `bottomNav` props — so all eight portal layouts
 * render exactly as before without an edit.
 * ════════════════════════════════════════════════════════════════════════════ */

const NAV_KEY: Record<string, string> = {
  Overview: "nav.overview",
  Registrations: "nav.registrations",
  Transactions: "nav.transactions",
  Payouts: "nav.payouts",
  Statements: "nav.statements",
  Alerts: "nav.alerts",
  // Group headings. The `@` prefix is not decoration — it keeps a heading from
  // ever colliding with a destination label, so a screen called "Money" could
  // not silently resolve to the money group's translation.
  "@learn": "navGroup.learn",
  "@teach": "navGroup.teach",
  "@counter": "navGroup.counter",
  "@ops": "navGroup.ops",
  "@children": "navGroup.children",
  "@money": "navGroup.money",
  "@team": "navGroup.team",
  "@comms": "navGroup.comms",
  "@account": "navGroup.account",
  "@oversight": "navGroup.oversight",
  "@manage": "navGroup.manage",
  "Requests": "nav.enrollmentRequests",
  "My Children": "nav.children",
  "Family": "nav.family",
  "My Classes": "nav.myClasses",
  "My Centers": "nav.myCenters",
  "Child Progress": "nav.childProgress",
  "Fees & Payments": "nav.feesPayments",
  Dashboard: "nav.dashboard",
  // The student portal's own two. Not a second naming system: the same
  // destination named ONCE, in the vocabulary of the role that opens it.
  // "لوحة التحكم" is a phrase for staff, and the student bar could not fit
  // either it or "المواد الدراسية" at 375px — measured, six targets, 63px each.
  "Student Home": "nav.studentHome",
  "My Subjects": "nav.mySubjects",
  "Student ID": "nav.studentId",
  // The teacher side's own word for the same destination, on the same
  // precedent as the student's two above. A teacher and their assistant say
  // "الملازم"; the STUDENT portal's page title, subtitle and empty state all
  // say "الملفات التعليمية", so re-pointing the shared key would have left
  // that portal's nav disagreeing with its own screen.
  "Teacher Materials": "nav.teacherMaterials",
  Practice: "nav.practice",
  Students: "nav.students",
  Teachers: "nav.teachers",
  "Off-system Teachers": "nav.externalTeachers",
  Classes: "nav.classes",
  Courses: "nav.courses",
  Grades: "nav.grades",
  Gradebook: "nav.gradebook",
  Fees: "nav.fees",
  Sessions: "nav.sessions",
  Schedule: "nav.schedule",
  Enrollments: "nav.enrollments",
  "Enrollment Requests": "nav.enrollmentRequests",
  // NOT `nav.affiliations`. "الانتسابات" is the SUPERSEDED name that
  // collaboration requests replaced (CLAUDE.md decision #3), and reusing that
  // key would put a retired term back in two sidebars. This is its own row.
  "Collaboration Requests": "nav.collaborationRequests",
  Expenses: "nav.expenses",
  Rooms: "nav.rooms",
  Reports: "nav.reports",
  Children: "nav.children",
  Attendance: "nav.attendance",
  Team: "nav.team",
  "Team Notes": "nav.teamNotes",
  "Audit log": "nav.auditLog",
  Messages: "nav.messages",
  Notifications: "nav.notifications",
  Settings: "nav.settings",
  Materials: "nav.materials",
  Reviews: "nav.reviews",
  "Family Code": "nav.family",
  Progress: "nav.progress",
  Affiliations: "nav.affiliations",
  Centers: "nav.centers",
  Browse: "nav.browse",
  Subjects: "nav.subjects",
  Subscriptions: "nav.subscriptions",
  Wallet: "nav.wallet",
  "Check-in": "nav.checkin",
  Counter: "nav.counter",
  "Door Check-in": "nav.doorCheckin",
  Staff: "nav.staff",
  Finance: "nav.finance",
  Catalog: "nav.catalog",
  "Child Safety": "nav.childSafety",
  // Not `nav.subscriptions` — that one reads "اشتراكاتي", which is the
  // student saying MINE. A parent is reading a child's.
  "Child Subscriptions": "nav.childSubscriptions",
  "Pay for a Lesson": "nav.payForChild",
  "My Wallet": "nav.parentWallet",
  "Guided tour": "nav.tour",
};

/**
 * Search result kind → its heading key. Mirrors `SearchKind` in
 * `@repo/server-core/services/search/global-search`; a kind missing here
 * renders its raw key, which is deliberately ugly rather than invisible.
 */
const SEARCH_KIND_KEY: Record<string, string> = {
  student: "shared.searchKind_student",
  child: "shared.searchKind_child",
  teacher: "shared.searchKind_teacher",
  external_teacher: "shared.searchKind_externalTeacher",
  course: "shared.searchKind_course",
  room: "shared.searchKind_room",
  staff: "shared.searchKind_staff",
  payment: "shared.searchKind_payment",
  center: "shared.searchKind_center",
};

const PORTAL_BASE: Record<string, string> = {
  center_admin: "admin",
  center_staff: "staff",
};

const roleLabels: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  assistant: "Assistant",
  parent: "Parent",
  admin: "Admin",
  center_staff: "Center Staff",
};

export type NavGroup = ShellNavGroup;

/**
 * Counts for the nav entries that own them.
 *
 * TWO RULES, and both are about not lying.
 *
 * 1. A QUERY IS ONLY ISSUED IF THE ROLE HOLDS THE DESTINATION. Not an
 *    optimisation — the endpoints are role-scoped, so asking on a portal that
 *    does not own the screen means a 403 on every page load for every user of
 *    that portal. It is also the constitution's own posture: do not reach for a
 *    capability this role does not have.
 *
 * 2. NO BADGE IS BETTER THAN A WRONG BADGE. `enrollment-requests` returns its
 *    full filtered set unpaginated, so the length IS the count and cannot
 *    undercount. Endpoints that page (the conversation list) are deliberately
 *    NOT wired here: a messages badge summed over the first page would read
 *    "3" while eleven were waiting, which tells the reader they are caught up
 *    when they are not. That is worse than a bare entry, so it stays bare until
 *    there is a count endpoint to read.
 */
function useNavBadges(hrefs: Set<string>): Record<string, number> {
  const enrollmentRequestsHref = [...hrefs].find((h) =>
    h.endsWith("/enrollment-requests"),
  );

  const { result } = useList({
    resource: "enrollment-requests",
    filters: [{ field: "status", operator: "eq" as const, value: "pending" }],
    queryOptions: { enabled: Boolean(enrollmentRequestsHref) },
  });

  return React.useMemo(() => {
    const map: Record<string, number> = {};
    const count = result?.total ?? 0;
    if (enrollmentRequestsHref && count > 0) {
      map[enrollmentRequestsHref] = count;
    }
    return map;
  }, [enrollmentRequestsHref, result?.total]);
}

export default function DashboardShell({
  role,
  navItems,
  navGroups,
  bottomNav,
  bottomNavMaxVisible,
  children,
}: {
  role: string;
  navItems?: NavItem[];
  navGroups?: NavGroup[];
  bottomNav?: string[];
  bottomNavMaxVisible?: number;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale() as "ar" | "en";
  const { dir } = useFormatters();
  const pathname = usePathname();
  const router = useRouter();
  const { data: identity } = useGetIdentity<MeResponse>();
  const { mutate: logout } = useLogout();

  const tNav = React.useCallback(
    (label: string) =>
      NAV_KEY[label] ? t(NAV_KEY[label] as Parameters<typeof t>[0]) : label,
    [t],
  );

  const { result: unreadResult } = useList({
    resource: "notifications",
    filters: [{ field: "read", operator: "eq" as const, value: false }],
    pagination: { pageSize: 1, currentPage: 1 },
  });
  const unreadCount = (unreadResult?.total ?? 0) as number;

  const hrefs = React.useMemo(() => {
    const groups = navGroups ?? [{ label: "", items: navItems ?? [] }];
    return new Set(groups.flatMap((g) => g.items).map((i) => i.href));
  }, [navGroups, navItems]);
  const badges = useNavBadges(hrefs);

  const displayName = identity?.name || roleLabels[role] || "User";

  const [searchQuery, setSearchQuery] = React.useState("");
  const searchResults = useGlobalSearch(searchQuery);
  const remote = React.useMemo(
    () => ({
      loading: searchResults.loading,
      truncated: searchResults.truncated,
      groups: searchResults.groups.map((g) => ({
        kind: g.kind,
        heading: SEARCH_KIND_KEY[g.kind]
          ? t(SEARCH_KIND_KEY[g.kind] as Parameters<typeof t>[0])
          : g.kind,
        hits: g.hits,
      })),
    }),
    [searchResults, t],
  );

  return (
    <AppShell
      role={role}
      roleLabel={t(("roles." + role) as Parameters<typeof t>[0])}
      displayName={displayName}
      {...(navGroups ? { groups: navGroups } : { navItems })}
      bottomNav={bottomNav}
      bottomNavMaxVisible={bottomNavMaxVisible}
      badges={badges}
      unreadCount={unreadCount}
      notificationsHref={`/dashboard/${PORTAL_BASE[role] ?? role}/notifications`}
      dir={dir === "rtl" ? "rtl" : "ltr"}
      locale={locale}
      pathname={pathname || "/"}
      linkAs={Link}
      translateNav={tNav}
      onLogout={() => logout()}
      onNavigate={(href) => router.push(href)}
      moreTour="bar-more"
      logo={
        <img src="/edura-mark.svg" alt="Edura" className="size-9 shrink-0" />
      }
      headerSettings={
        <>
          <LanguageSwitcher />
          <ThemeToggle />
        </>
      }
      headerSettingsCompact={<HeaderQuickSettings />}
      search={{
        query: searchQuery,
        onQueryChange: setSearchQuery,
        remote,
      }}
      strings={{
        collapseSidebar: t("shared.collapseSidebar"),
        expandSidebar: t("shared.expandSidebar"),
        logout: t("actions.logout"),
        notifications: t("nav.notifications"),
        dashboard: t("nav.dashboard"),
        more: t("nav.more"),
        allSections: t("nav.allSections"),
        search: t("shared.commandPalette"),
        searchPlaceholder: t("shared.commandPalettePlaceholder"),
        searchEmpty: t("shared.commandPaletteEmpty"),
        searchFallbackHeading: t("nav.dashboard"),
        searchDestinationsHeading: t("shared.searchDestinations"),
        searchSearching: t("shared.searchSearching"),
        searchTruncated: t("shared.searchTruncated"),
        searchMasked: t("shared.searchMasked"),
      }}
    >
      {children}
    </AppShell>
  );
}
