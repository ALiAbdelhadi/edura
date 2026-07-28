"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGetIdentity, useLogout, useList } from "@refinedev/core";
import {
  Home,
  Calendar,
  ClipboardList,
  Award,
  CheckCircle2,
  MessageSquare,
  BookOpen,
  Users,
  User,
  DollarSign,
  Bell,
  Settings,
  LayoutGrid,
  BarChart3,
  FileSearch,
  Star,
  Search,
  Wallet,
  ShieldCheck,
  LogOut,
  PanelLeft,
  type LucideIcon,
} from "lucide-react";
import type { MeResponse } from "@/lib/refine";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { HeaderQuickSettings } from "@/components/ui/header-quick-settings";
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
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";

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
  bell: Bell,
  settings: Settings,
  grid: LayoutGrid,
  chart: BarChart3,
  report: FileSearch,
  star: Star,
  search: Search,
  wallet: Wallet,
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
  superadmin: "Super Admin",
  finance: "Accountant",
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

export default function DashboardShell({
  role,
  navItems,
  children,
}: {
  role: string;
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations();
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

  const path = (pathname ?? "").replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
  const selectedKey =
    navItems.find((item) => path === item.href)?.href ||
    [...navItems]
      .filter((item) => path === item.href || path.startsWith(item.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ||
    navItems[0]?.href;

  const screenLabel =
    navItems.find((item) => item.href === selectedKey)?.label || "Dashboard";

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar side={dir === "rtl" ? "right" : "left"} collapsible="icon">
        <SidebarHeader className="gap-0 border-b border-sidebar-border">
          <div className="flex h-12 items-center gap-2 px-1">
            <img
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
              <AvatarFallback className="bg-indigo font-bold text-indigo-ink">
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
          <SidebarMenu className="px-2 py-2">
            {navItems.map((item) => {
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
                    <SidebarMenuBadge className="bg-destructive text-white">
                      {unreadCount}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => logout()}
                tooltip={t("actions.logout")}
                className="text-red hover:bg-red-soft hover:text-red active:bg-red-soft active:text-red"
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
            <HeaderSidebarToggle />
            <div className="h-5 w-px shrink-0 bg-border" />
            <h1 className="truncate text-lg font-semibold tracking-tight text-ink">
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
                  href={`/dashboard/${role === "center_admin" ? "admin" : role}/notifications`}
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
      </SidebarInset>
    </SidebarProvider>
  );
}
