"use client";

import { HeaderQuickSettings } from "@/components/ui/header-quick-settings";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useGlobalSearch } from "@/lib/api/use-global-search";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { QUERY_FRESHNESS, type MeResponse } from "@/lib/refine";
import { useCustom, useGetIdentity, useList, useLogout } from "@refinedev/core";
import {
  AppShell,
  type NavGroup as ShellNavGroup,
  type NavItem,
} from "@repo/ui/components/app-shell";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { useLocale, useTranslations } from "next-intl";
import React from "react";

const NAV_KEY: Record<string, string> = {
  Overview: "nav.overview",
  Registrations: "nav.registrations",
  Transactions: "nav.transactions",
  Payouts: "nav.payouts",
  Payments: "nav.payments",
  Messaging: "nav.messaging",
  Commission: "nav.commission",
  Collaborations: "nav.collaborations",
  Subscriptions: "nav.subscriptions",
  "Room settlements": "nav.roomSettlements",
  Statements: "nav.statements",
  Alerts: "nav.alerts",
  Dashboard: "nav.dashboard",
  Students: "nav.students",
  Teachers: "nav.teachers",
  Users: "nav.users",
  WhatsApp: "nav.whatsapp",
  Classes: "nav.classes",
  Courses: "nav.courses",
  Grades: "nav.grades",
  Gradebook: "nav.gradebook",
  Fees: "nav.fees",
  Sessions: "nav.sessions",
  Schedule: "nav.schedule",
  Enrollments: "nav.enrollments",
  "Enrollment Requests": "nav.enrollmentRequests",
  Expenses: "nav.expenses",
  Rooms: "nav.rooms",
  Reports: "nav.reports",
  Children: "nav.children",
  Attendance: "nav.attendance",
  Team: "nav.team",
  Messages: "nav.messages",
  Notifications: "nav.notifications",
  Settings: "nav.settings",
  Materials: "nav.materials",
  Reviews: "nav.reviews",
  Assignments: "nav.assignments",
  "Family Code": "nav.family",
  Progress: "nav.progress",
  Affiliations: "nav.affiliations",
  Centers: "nav.centers",
  Browse: "nav.browse",
  Catalog: "nav.catalog",
  "Wallet policy": "nav.walletPolicy",
  "Audit log": "nav.auditLog",
  Security: "nav.security",
  "Feature flags": "nav.featureFlags",
  "Contact inbox": "nav.contactInbox",
  "Deletion requests": "nav.deletionQueue",
  "@oversight": "navGroup.oversight",
  "@money": "navGroup.money",
  "@comms": "navGroup.comms",
  "@governance": "navGroup.governance",
};

const roleLabels: Record<string, string> = {
  superadmin: "Super Admin",
  finance: "Accountant",
};

const SEARCH_KIND_KEY: Record<string, string> = {
  student: "shared.searchKind_student",
  teacher: "shared.searchKind_teacher",
  parent: "shared.searchKind_parent",
  assistant: "shared.searchKind_assistant",
  center_admin: "shared.searchKind_centerAdmin",
  staff: "shared.searchKind_staff",
  back_office: "shared.searchKind_backOffice",
  center: "shared.searchKind_center",
  payment_intent: "shared.searchKind_paymentIntent",
};

export type NavGroup = ShellNavGroup;

function useNavBadges(hrefs: Set<string>): Record<string, number> {
  const registrationsHref = [...hrefs].find((h) =>
    h.endsWith("/registrations"),
  );

  const { result } = useCustom<{ centers: number; teachers: number; total: number }>({
    url: "admin/registrations/count",
    method: "get",
    queryOptions: { ...QUERY_FRESHNESS.list, enabled: Boolean(registrationsHref) },
  });
  const total = result?.data?.total;

  return React.useMemo(() => {
    const map: Record<string, number> = {};
    const count = total ?? 0;
    if (registrationsHref && count > 0) map[registrationsHref] = count;
    return map;
  }, [registrationsHref, total]);
}

export default function DashboardShell({
  role,
  navItems,
  navGroups,
  bottomNav,
  children,
}: {
  role: string;
  navItems?: NavItem[];
  navGroups?: NavGroup[];
  bottomNav?: string[];
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale() as "ar" | "en";
  const { dir } = useFormatters();
  const pathname = usePathname();
  const router = useRouter();
  const { data: identity } = useGetIdentity<MeResponse>({
    queryOptions: { refetchOnMount: false },
  });
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
  const queryStrings = useQueryStrings();
  const remote = React.useMemo(
    () => ({
      loading: searchResults.loading,
      truncated: searchResults.truncated,
      ...(searchResults.failed ? { error: queryStrings.loadFailed } : {}),
      groups: searchResults.groups.map((g) => ({
        kind: g.kind,
        heading: SEARCH_KIND_KEY[g.kind]
          ? t(SEARCH_KIND_KEY[g.kind] as Parameters<typeof t>[0])
          : g.kind,
        hits: g.hits,
      })),
    }),
    [searchResults, queryStrings, t],
  );

  return (
    <AppShell
      role={role}
      roleLabel={t(("roles." + role) as Parameters<typeof t>[0])}
      displayName={displayName}
      {...(navGroups ? { groups: navGroups } : { navItems })}
      bottomNav={bottomNav}
      badges={badges}
      unreadCount={unreadCount}
      notificationsHref={`/dashboard/${role === "center_admin" ? "admin" : role}/notifications`}
      dir={dir === "rtl" ? "rtl" : "ltr"}
      locale={locale}
      pathname={pathname || "/"}
      linkAs={Link}
      translateNav={tNav}
      onLogout={() => logout()}
      onNavigate={(href) => router.push(href)}
      logo={
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/edura-mark.svg" alt="Edura" className="size-9 shrink-0" />
      }
      headerSettings={
        <>
          <LanguageSwitcher />
          <ThemeToggle />
        </>
      }
      headerSettingsCompact={<HeaderQuickSettings />}
      search={{ query: searchQuery, onQueryChange: setSearchQuery, remote }}
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
