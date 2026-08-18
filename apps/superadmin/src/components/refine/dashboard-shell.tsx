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
 * This file used to BE the shell — 505 lines of it, beside a 489-line twin in
 * apps/erp. They had already drifted where nobody diffs: this one drew its nav
 * badge white-on-destructive and the other amber-on-amber-soft, and this one
 * never remapped the guided tour's ids onto the phone bar.
 *
 * The chrome now lives once, in @repo/ui/components/app-shell. This is the seam
 * that hands it what @repo/ui cannot import. The public shape is UNCHANGED, so
 * both back-office layouts render as before with no edit.
 * ════════════════════════════════════════════════════════════════════════════ */

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
  // Group headings. The `@` prefix is not decoration — it keeps a heading from
  // ever colliding with a destination label, so a screen called "Money" could
  // not silently resolve to the money group's translation.
  "@oversight": "navGroup.oversight",
  "@money": "navGroup.money",
  "@comms": "navGroup.comms",
  "@governance": "navGroup.governance",
};

const roleLabels: Record<string, string> = {
  superadmin: "Super Admin",
  finance: "Accountant",
};

/**
 * Search result kind → its heading key. Mirrors `SearchKind` in
 * `@repo/server-core/services/search/global-search`; a kind missing here
 * renders its raw key, which is deliberately ugly rather than invisible.
 *
 * Only the kinds THIS app's providers can emit are listed. The ERP's own kinds
 * (rooms, groups, off-system teachers) are absent because no provider here
 * returns one — a heading for a row that cannot arrive is dead config.
 */
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

/**
 * Counts for the nav entries that own them.
 *
 * Only ONE is wired, and only for the portal that holds it: the pending
 * registrations queue. It is exact — `/admin/registrations` returns its whole
 * set unpaginated, so the length IS the count — and it is the queue this
 * portal exists to work through, which is why it earns the first badge.
 *
 * The query is skipped entirely when the role's nav does not carry that
 * destination, so the accountant's portal does not spend a request per page
 * load asking about a screen it will never show.
 */
function useNavBadges(hrefs: Set<string>): Record<string, number> {
  const registrationsHref = [...hrefs].find((h) =>
    h.endsWith("/registrations"),
  );

  const { result } = useList({
    resource: "admin-registrations",
    filters: [{ field: "status", operator: "eq" as const, value: "pending" }],
    queryOptions: { enabled: Boolean(registrationsHref) },
  });

  return React.useMemo(() => {
    const map: Record<string, number> = {};
    const count = result?.total ?? 0;
    if (registrationsHref && count > 0) map[registrationsHref] = count;
    return map;
  }, [registrationsHref, result?.total]);
}

export default function DashboardShell({
  role,
  navItems,
  navGroups,
  bottomNav,
  children,
}: {
  role: string;
  /** Flat list. Pass this OR `navGroups`, never both. */
  navItems?: NavItem[];
  /**
   * Grouped list. Preferred once a portal outgrows ~8 destinations: an
   * unbroken column of twenty is scanned linearly every single time, while
   * four labelled runs are scanned by heading first.
   */
  navGroups?: NavGroup[];
  /**
   * Phone chrome. Hrefs in BAR ORDER. LIST EVERY href IN `navItems`: passing
   * this hides the sidebar toggle on phones, so an href left out is a
   * destination a phone user cannot reach.
   */
  bottomNav?: string[];
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

  /* ── record search ──────────────────────────────────────────────────────
   * The query lives here rather than in the shell because THIS is the layer
   * that can fetch, and the kind → heading catalogue is the app's because
   * @repo/ui has no message catalogue. Which records actually come back is the
   * SERVER's decision, per role (`PROVIDERS[].roles` in admin/global-search.ts)
   * — an accountant gets payment attempts and nothing else, and that is not
   * expressed anywhere on this side. */
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
      badges={badges}
      unreadCount={unreadCount}
      notificationsHref={`/dashboard/${role === "center_admin" ? "admin" : role}/notifications`}
      dir={dir === "rtl" ? "rtl" : "ltr"}
      locale={locale}
      // `usePathname` from @/i18n/navigation already strips the locale prefix.
      pathname={pathname || "/"}
      linkAs={Link}
      translateNav={tNav}
      onLogout={() => logout()}
      onNavigate={(href) => router.push(href)}
      logo={
        // A bare <img> and not next/image: the optimizer REFUSES SVG unless
        // `dangerouslyAllowSVG` is set, and there is nothing to optimise in
        // 1.8 KB of vector rendered at a fixed 36px either way.
        //
        // `alt="Edura"`, because the shell no longer renders a wordmark beside
        // it (Ali, 2026-08-14) — this mark is the only thing naming the product
        // in the sidebar header. It was briefly `alt=""` while the wordmark was
        // there, which was right then and wrong now: the alt describes what the
        // reader is missing, so it follows what else is on screen.
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
