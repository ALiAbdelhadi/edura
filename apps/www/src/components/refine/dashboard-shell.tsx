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
  SidebarGroup,
  SidebarGroupLabel,
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
import {
  BottomNav,
  type BottomNavItem,
} from "@repo/ui/components/bottom-nav";
import { Num } from "@repo/ui/components/num";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const NAV_KEY: Record<string, string> = {
  Overview: "nav.overview",
  Oversight: "navGroup.oversight",
  Money: "navGroup.money",
  Comms: "navGroup.comms",
  Requests: "nav.requests",
  "My Classes": "nav.myClasses",
  "My Centers": "nav.myCenters",
  "My Children": "nav.children",
  "Child Progress": "nav.progress",
  "Fees & Payments": "nav.fees",
  Family: "nav.family",
  Payments: "nav.payments",
  Registrations: "nav.registrations",
  Transactions: "nav.transactions",
  Payouts: "nav.payouts",
  Statements: "nav.statements",
  Alerts: "nav.alerts",
  Dashboard: "nav.dashboard",
  Students: "nav.students",
  Teachers: "nav.teachers",
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
  Subjects: "nav.subjects",
  Wallet: "nav.wallet",
  "Check-in": "nav.checkin",
  "Door Check-in": "nav.doorCheckin",
  Staff: "nav.staff",
  Finance: "nav.finance",
  Catalog: "nav.catalog",
  "Child Safety": "nav.childSafety",
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
  /**
   * Which labelled section this destination belongs to. The audit's finding
   * was 16 flat items with five sibling money screens indistinguishable from
   * each other; a group label is what makes "المدفوعات" and "مستحقات وصرف"
   * read as different things.
   *
   * Optional: a layout that passes no groups renders flat exactly as before,
   * so the eight existing layouts keep working untouched and each portal
   * session adds its groups when it converts.
   */
  group?: string;
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

function HeaderSidebarToggle() {
  const t = useTranslations();
  const { toggleSidebar, isMobile, openMobile, state } = useSidebar();
  const expanded = isMobile ? openMobile : state === "expanded";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
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
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Link
      href={href}
      onClick={() => {
        if (isMobile) setOpenMobile(false);
      }}
    >
      {children}
    </Link>
  );
}

/**
 * Phone chrome. Takes the hrefs to surface, not a second item list, so the
 * bottom nav can never drift out of sync with the sidebar — it is a VIEW of
 * `navItems`, selecting 4–5 destinations and pushing the rest behind "more".
 * "More" opens the existing mobile sidebar sheet rather than a second menu.
 */
function ShellBottomNav({
  items,
  activeHref,
  moreLabel,
  showMore,
}: {
  items: BottomNavItem[];
  activeHref?: string;
  moreLabel: string;
  showMore: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <BottomNav
      items={items}
      activeHref={activeHref}
      moreLabel={moreLabel}
      showMore={showMore}
      onMore={() => setOpenMobile(true)}
    />
  );
}

/**
 * Scoping context for the header's left slot — the thing every figure on the
 * screen is scoped to. Superadmin's is the active financial cycle.
 *
 * A portal with no genuine scope passes NOTHING and gets the page title. Do
 * not invent chrome to fill this slot: an interface that states a scope the
 * system does not actually enforce is worse than one that states none.
 */
type HeaderScope = {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Optional trailing note, e.g. a closed-ledger lock. Rendered in --teal. */
  note?: React.ReactNode;
};

export default function DashboardShell({
  role,
  navItems,
  scope,
  search,
  bottomNavHrefs,
  children,
}: {
  role: string;
  navItems: NavItem[];
  scope?: HeaderScope;
  /** Command search. Pass only once a palette/endpoint actually exists. */
  search?: React.ReactNode;
  /**
   * Destinations to surface in the phone bottom nav, in order. Student, parent
   * and staff are the portals actually used on a phone; teacher and assistant
   * are desktop-first (their one phone surface, door check-in, is a task
   * screen rather than a browse surface). Omit to render no bottom nav.
   */
  bottomNavHrefs?: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations();
  const { dir } = useFormatters();
  const tNav = (label: string) =>
    NAV_KEY[label] ? t(NAV_KEY[label] as Parameters<typeof t>[0]) : label;

  // Preserve declaration order, collapsing consecutive items that share a
  // group. A layout passing no groups yields one unlabelled section, which
  // renders exactly as the flat list did.
  const navGroups = React.useMemo(() => {
    const out: { group?: string; items: NavItem[] }[] = [];
    for (const item of navItems) {
      const last = out[out.length - 1];
      if (last && last.group === item.group) last.items.push(item);
      else out.push({ group: item.group, items: [item] });
    }
    return out;
  }, [navItems]);
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

  const path = (pathname ?? "").replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
  const selectedKey =
    navItems.find((item) => path === item.href)?.href ||
    [...navItems]
      .filter((item) => path === item.href || path.startsWith(item.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ||
    navItems[0]?.href;

  const screenLabel =
    navItems.find((item) => item.href === selectedKey)?.label || "Dashboard";

  // A VIEW of navItems, not a second list — so the two navs cannot drift.
  const bottomNavItems: BottomNavItem[] = React.useMemo(() => {
    if (!bottomNavHrefs?.length) return [];
    return bottomNavHrefs.flatMap((href) => {
      const item = navItems.find((n) => n.href === href);
      if (!item) return [];
      const isNotifications = item.href.includes("notifications");
      return [
        {
          href: item.href,
          label: tNav(item.label),
          icon: iconMap[item.icon] || LayoutGrid,
          count: isNotifications && unreadCount > 0 ? unreadCount : undefined,
          countLabel: isNotifications ? t("nav.notifications") : undefined,
        },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomNavHrefs, navItems, unreadCount]);

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
          {navGroups.map(({ group, items }) => (
            <SidebarGroup key={group ?? "__flat"} className="py-0">
              {group ? (
                <SidebarGroupLabel asChild>
                  <Eyebrow className="px-2 pt-4 pb-1.5">{tNav(group)}</Eyebrow>
                </SidebarGroupLabel>
              ) : null}
              <SidebarMenu className="px-2 py-2">
                {items.map((item) => {
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
                        // Amber on amber-soft, mono, WITH an accessible name.
                        // The old bare red dot was `aria-hidden` with no text
                        // equivalent — invisible to a screen reader, and red
                        // for something that is merely waiting.
                        <SidebarMenuBadge className="bg-amber-soft text-amber">
                          <Num aria-label={t("nav.notifications")}>
                            {unreadCount}
                          </Num>
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
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
        {/* 60px, --sheet, bottom rule, 24px inline padding (Handoff I §3.2).
            No backdrop blur: the canvas is paper, and a translucent bar over it
            reads as glass — the one material this system is defined against. */}
        <header className="flex h-15 shrink-0 items-center justify-between gap-2 border-b border-rule bg-sheet px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <HeaderSidebarToggle />
            <div className="h-[18px] w-px shrink-0 bg-rule" />
            {scope ? (
              // The scoping-context slot. Superadmin's is the financial cycle;
              // a portal with no real scope passes nothing and gets the page
              // title instead. Do NOT fill this slot with invented chrome.
              <div className="flex min-w-0 items-baseline gap-2">
                <Eyebrow>{scope.label}</Eyebrow>
                <Num className="truncate text-[13px] font-semibold text-ink">
                  {scope.value}
                </Num>
                {scope.note ? (
                  <>
                    <span className="h-[18px] w-px shrink-0 bg-rule" />
                    <span className="truncate text-xs text-teal">
                      {scope.note}
                    </span>
                  </>
                ) : null}
              </div>
            ) : (
              <h1 className="truncate text-lg font-semibold tracking-tight text-ink">
                {tNav(screenLabel)}
              </h1>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* §3.2 also specifies a command search with a ⌘K chip. It is NOT
                rendered here: no command palette is mounted in either app, and
                superadmin has no search endpoint at all. A search box that
                searches nothing is the same class of lie as a nav entry with no
                destination. Pass `search` once there is something behind it. */}
            {search ?? null}
            <div className="hidden items-center gap-3 lg:flex">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <div className="lg:hidden">
              <HeaderQuickSettings />
            </div>
            {/* The notification bell is deliberately gone from the header: it
                lives in the nav group, where it carries a counted badge with a
                real accessible name (Handoff I §3.2). */}
            <Avatar>
              <AvatarFallback className="bg-indigo font-bold text-indigo-ink">
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

        {bottomNavItems.length > 0 ? (
          <ShellBottomNav
            items={bottomNavItems}
            activeHref={selectedKey}
            moreLabel={t("nav.more")}
            // Every destination the bottom nav does NOT surface still has to
            // be reachable — "more" opens the sidebar sheet holding all of them.
            showMore={navItems.length > bottomNavItems.length}
          />
        ) : null}
      </SidebarInset>
    </SidebarProvider>
  );
}
