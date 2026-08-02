"use client";

import { HeaderQuickSettings } from "@/components/ui/header-quick-settings";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { MeResponse } from "@/lib/refine";
import { useGetIdentity, useList, useLogout } from "@refinedev/core";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@repo/ui/components/sidebar";
import Image from "next/image";
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  FileSearch,
  Home,
  LayoutGrid,
  LogOut,
  MessageSquare,
  PanelLeft,
  Search,
  Settings,
  ShieldCheck,
  Star,
  User,
  Users,
  Wallet as WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { BottomNav } from "@repo/ui/components/bottom-nav";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import React from "react";

const NAV_KEY: Record<string, string> = {
  Overview: "nav.overview",
  Registrations: "nav.registrations",
  Transactions: "nav.transactions",
  Payouts: "nav.payouts",
  Statements: "nav.statements",
  Alerts: "nav.alerts",
  "@learn": "navGroup.learn",
  "@money": "navGroup.money",
  "@comms": "navGroup.comms",
  "@oversight": "navGroup.oversight",
  "@manage": "navGroup.manage",
  "@counter": "navGroup.counter",
  "Requests": "nav.enrollmentRequests",
  "My Children": "nav.children",
  "Family": "nav.family",
  "My Classes": "nav.myClasses",
  "My Centers": "nav.myCenters",
  "Child Progress": "nav.childProgress",
  "Fees & Payments": "nav.feesPayments",
  Dashboard: "nav.dashboard",
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
  Wallet: "nav.wallet",
  "Check-in": "nav.checkin",
  "Door Check-in": "nav.doorCheckin",
  Staff: "nav.staff",
  Finance: "nav.finance",
  Catalog: "nav.catalog",
  "Child Safety": "nav.childSafety",
  "Pay for a Lesson": "nav.payForChild",
  "My Wallet": "nav.parentWallet",
};

const PORTAL_BASE: Record<string, string> = {
  center_admin: "admin",
  center_staff: "staff",
};

const iconMap: Record<string, LucideIcon> = {
  home: Home,
  calendar: Calendar,
  clipboard: ClipboardList,
  award: Award,
  check: CheckCircle2,
  message: MessageSquare,
  book: BookOpen,
  users: Users,
  person: User,
  dollar: DollarSign,
  wallet: WalletIcon,
  bell: Bell,
  settings: Settings,
  grid: LayoutGrid,
  chart: BarChart3,
  report: FileSearch,
  star: Star,
  search: Search,
  shield: ShieldCheck,
};

type NavItem = {
  href: string;
  icon: string;
  label: string;
};

const roleLabels: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  assistant: "Assistant",
  parent: "Parent",
  admin: "Admin",
  center_staff: "Center Staff",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * ONE navigation per viewport.
 *
 * A portal that ships a phone bar must NOT also ship the drawer behind this
 * button: the two carry the same destinations, so a phone showed two complete
 * navigation systems at once and neither was authoritative. The bar is the
 * phone's navigation and the sidebar is the desktop's, so this button is a
 * DESKTOP affordance in those portals and hides with the breakpoint the bar
 * appears at (`md`, the same 768px `useIsMobile` switches the sidebar to a
 * drawer at — they must stay in step or a width exists with neither).
 *
 * Portals with no bar (teacher, assistant, center admin, center staff) keep it
 * at every width: there the drawer IS the only navigation.
 */
function HeaderSidebarToggle({ desktopOnly }: { desktopOnly: boolean }) {
  const t = useTranslations();
  const { toggleSidebar, isMobile, openMobile, state } = useSidebar();
  const expanded = isMobile ? openMobile : state === "expanded";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={desktopOnly ? "hidden md:inline-flex" : undefined}
      onClick={toggleSidebar}
      aria-label={
        expanded ? t("shared.collapseSidebar") : t("shared.expandSidebar")
      }
      aria-expanded={expanded}
    >
      <PanelLeft className="size-4 rtl:-scale-x-100" />
    </Button>
  );
}

/**
 * Nav link that dismisses the mobile sidebar sheet after a selection — on
 * mobile the sidebar is an overlay, so it must get out of the way once the
 * user picks a destination. Desktop keeps its persistent rail.
 */
function SidebarNavLink({
  href,
  onClick,
  children,
  ...props
}: React.ComponentProps<typeof Link>) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    // `...props` is load-bearing, not tidiness. This sits inside two nested Radix
    // Slots — <TooltipTrigger asChild> wrapping <SidebarMenuButton asChild> — and a
    // Slot passes the parent's props DOWN to its child rather than rendering an
    // element of its own. Everything the nav item is comes in through here:
    // className (the entire menu-button style), data-active / data-slot /
    // data-sidebar / data-size, the tooltip's aria wiring, and the ref.
    // Without the spread they were all silently dropped and every nav item in every
    // portal rendered as a bare inline <a> — unstyled, with no active state and no
    // tooltip, and with its icon stacked above its label instead of beside it.
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        // Chain rather than replace: the Slot may have merged a handler in.
        onClick?.(event);
        if (isMobile) setOpenMobile(false);
      }}
    >
      {children}
    </Link>
  );
}

/* Nav is GROUPED (Handoff I §3.1): sixteen flat items is a list, not a structure, and
   the five money screens sitting as siblings among sixteen is why "Payments" and
   "Payouts" could both read «المدفوعات» without anyone noticing.

   `navGroups` and `navItems` are BOTH accepted so the six portal layouts can convert
   one at a time — a portal session changes its own layout.tsx and nothing else. When
   the last flat caller is gone, drop `navItems`. */
export type NavGroup = { label: string; items: NavItem[] };

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
  /**
   * Phone chrome. Student, parent and staff are mostly on phones; a sidebar there is
   * a drawer you must open before you can navigate.
   *
   * Hrefs in BAR ORDER, drawn from navItems — the bar's own `maxVisible` decides
   * how many get a slot and puts the remainder behind "more", so this is the full
   * list, not the first four.
   *
   * LIST EVERY href IN `navItems`. Passing this hides the sidebar toggle on phones
   * (see HeaderSidebarToggle), so an href left out of it is a destination a phone
   * user cannot reach at all. Anything omitted here must be deliberately
   * desktop-only.
   */
  bottomNav?: string[];
  children: React.ReactNode;
}) {
  const groups: NavGroup[] = navGroups ?? [{ label: "", items: navItems ?? [] }];
  const flatNav: NavItem[] = groups.flatMap((g) => g.items);
  const pathname = usePathname();
  const t = useTranslations();
  const locale = useLocale() as "ar" | "en";
  const { dir } = useFormatters();
  const tNav = (label: string) =>
    NAV_KEY[label] ? t(NAV_KEY[label] as Parameters<typeof t>[0]) : label;
  const { data: identity } = useGetIdentity<MeResponse>();
  const { mutate: logout } = useLogout();

  const { result: unreadResult } = useList({
    resource: "notifications",
    filters: [{ field: "read", operator: "eq" as const, value: false }],
    pagination: { pageSize: 1, currentPage: 1 },
  });
  const unreadCount = (unreadResult?.total ?? 0) as number;

  const roleName = roleLabels[role] || "User";
  const displayName = identity?.name || roleName;

  // `usePathname` from @/i18n/navigation already strips the locale prefix.
  const path = pathname || "/";
  const selectedKey =
    flatNav.find((item) => path === item.href)?.href ||
    [...flatNav]
      .filter((item) => path === item.href || path.startsWith(item.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ||
    flatNav[0]?.href;

  const screenLabel =
    flatNav.find((item) => item.href === selectedKey)?.label || "Dashboard";

  // Bottom nav is a SUBSET of the same nav, never a second information architecture —
  // a destination that exists only on the phone is a destination desktop users cannot
  // find. `bottomNav` names hrefs already present in the sidebar.
  const bottomNavItems = (bottomNav ?? [])
    .map((href) => flatNav.find((i) => i.href === href))
    .filter((i): i is NavItem => Boolean(i))
    .map((i) => {
      const Icon = iconMap[i.icon] || LayoutGrid;
      const badge =
        i.href.includes("notifications") && unreadCount > 0 ? unreadCount : undefined;
      return {
        key: i.href,
        href: i.href,
        label: tNav(i.label),
        icon: <Icon className="size-5" />,
        ...(badge !== undefined
          ? { badge, badgeLabel: `${tNav(i.label)} (${badge})` }
          : {}),
      };
    });

  // The one fact the header toggle needs, derived from what is ACTUALLY
  // rendered rather than promised by a prop. A portal that renders its own bar
  // as a child could claim one and be wrong; this cannot disagree with itself.
  const hasPhoneNav = bottomNavItems.length > 0;

  // Hiding the toggle turns "this href is missing from `bottomNav`" from an
  // ordering preference into a destination no phone can reach, across seven
  // portals whose nav lists keep growing. A doc comment does not survive that —
  // the parent bar had already drifted two entries behind its sidebar before
  // anyone noticed. Dev-only: this is an authoring mistake, caught while the
  // author is looking, and it must never cost anything in production.
  // `flatNav`/`bottomNav` are rebuilt every render; their CONTENT is what
  // decides this, so the effect keys on stable strings rather than on array
  // identities that change on every keystroke.
  const navKey = flatNav.map((i) => i.href).join("|");
  const barKey = (bottomNav ?? []).join("|");
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production" || !barKey) return;
    const bar = barKey.split("|");
    const missing = navKey.split("|").filter((href) => !bar.includes(href));
    if (missing.length) {
      console.error(
        `[DashboardShell] role="${role}": ${missing.length} destination(s) are in the sidebar but not in \`bottomNav\`, so they are UNREACHABLE on phones (the sidebar toggle is hidden wherever a bar exists). Add them to the bar order:\n  ${missing.join("\n  ")}`,
      );
    }
  }, [role, navKey, barKey]);

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar side={dir === "rtl" ? "right" : "left"} collapsible="icon">
        <SidebarHeader className="gap-0 border-b border-sidebar-border">
          <div className="flex h-12 items-center gap-2 px-1">
            <Image
              width={36}
              height={36}
              src="/edura-mark.svg"
              alt="Edura"
              className="size-9 shrink-0"
            />
            <span className="text-base font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              Edura
            </span>
          </div>
          <div className="flex items-center gap-2 px-1 pb-2">
            <Avatar>
              <AvatarFallback className="bg-primary font-bold text-primary-foreground">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">
                {displayName}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/70">
                {t(("roles." + role) as Parameters<typeof t>[0])}
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {groups.map((group, gi) => (
            <SidebarMenu key={group.label || gi} className="px-2 py-2">
              {group.label ? (
                <Eyebrow
                  locale={locale}
                  className="mb-1.5 px-2 group-data-[collapsible=icon]:hidden"
                >
                  {tNav(group.label)}
                </Eyebrow>
              ) : null}
              {group.items.map((item) => {
                const Icon = iconMap[item.icon] || LayoutGrid;
                const isActive = item.href === selectedKey;
                const isNotifications = item.href.includes("notifications");
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={tNav(item.label)}
                    >
                      <SidebarNavLink href={item.href}>
                        <Icon />
                        <span>{tNav(item.label)}</span>
                      </SidebarNavLink>
                    </SidebarMenuButton>
                    {isNotifications && unreadCount > 0 ? (
                      // Amber on amber-soft: a count is WAITING, not an error. It was
                      // red, which is reserved for irreversible or blocking. It also
                      // carries its number as TEXT — the old red dot was aria-hidden
                      // and had no screen-reader equivalent at all.
                      <SidebarMenuBadge className="num bg-amber-soft font-semibold text-amber">
                        {unreadCount}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => logout()}
                tooltip={t("actions.logout")}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/10 active:text-destructive"
              >
                <LogOut />
                <span>{t("actions.logout")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-sm supports-backdrop-filter:bg-background/70 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <HeaderSidebarToggle desktopOnly={hasPhoneNav} />
            {/* The rule separates the toggle from the title, so it goes where
                the toggle goes — left on its own it reads as a stray mark
                floating before the screen name. */}
            <div
              className={`h-5 w-px shrink-0 bg-border ${hasPhoneNav ? "hidden md:block" : ""}`}
            />
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {tNav(screenLabel)}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-3 lg:flex">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <div className="lg:hidden">
              <HeaderQuickSettings />
            </div>
            <div className="relative">
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label={`${t("nav.notifications")}${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
              >
                <Link
                  href={`/dashboard/${PORTAL_BASE[role] ?? role}/notifications`}
                >
                  <Bell className="size-4" />
                </Link>
              </Button>
              {unreadCount > 0 ? (
                <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              ) : null}
            </div>
            <Avatar>
              <AvatarFallback className="bg-primary font-bold text-primary-foreground">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        <div
          tabIndex={0}
          role="region"
          aria-label={tNav(screenLabel)}
          className="min-h-70 min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8"
        >
          {children}
        </div>

        {/* Phone chrome. Hidden at md+ by the component itself, so the sidebar remains
            the only navigation on desktop and the two never coexist. */}
        {bottomNavItems.length ? (
          <BottomNav
            items={bottomNavItems}
            activeKey={selectedKey}
            maxVisible={5}
            linkAs={Link}
            navLabel={t("nav.dashboard")}
            moreLabel={t("nav.more")}
            moreTitle={t("nav.allSections")}
          />
        ) : null}
      </SidebarInset>
    </SidebarProvider>
  );
}
