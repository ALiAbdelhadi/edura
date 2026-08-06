"use client";

import { HeaderQuickSettings } from "@/components/ui/header-quick-settings";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Link, usePathname } from "@/i18n/navigation";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { MeResponse } from "@/lib/refine";
import { useGetIdentity, useList, useLogout } from "@refinedev/core";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { BottomNav } from "@repo/ui/components/bottom-nav";
import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
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
  IdCard,
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
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
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
  "Student ID": "nav.studentId",
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
  "id-card": IdCard,
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

function SidebarNavLink({
  href,
  onClick,
  children,
  ...props
}: React.ComponentProps<typeof Link>) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (isMobile) setOpenMobile(false);
      }}
    >
      {children}
    </Link>
  );
}

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

  const path = pathname || "/";
  const selectedKey =
    flatNav.find((item) => path === item.href)?.href ||
    [...flatNav]
      .filter((item) => path === item.href || path.startsWith(item.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ||
    flatNav[0]?.href;

  const screenLabel =
    flatNav.find((item) => item.href === selectedKey)?.label || "Dashboard";

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

  const hasPhoneNav = bottomNavItems.length > 0;

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
                <span className="absolute -inset-e-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
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
