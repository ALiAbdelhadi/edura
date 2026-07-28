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
import { Num } from "@repo/ui/components/num";
import { Eyebrow } from "@repo/ui/components/eyebrow";
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
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";

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
  /**
   * Which labelled section this destination belongs to. The audit's finding
   * was 16 flat items with five sibling money screens indistinguishable from
   * each other; a group label is what makes "المدفوعات" and "مستحقات وصرف"
   * read as different things.
   *
   * Optional: a layout that passes no groups renders flat exactly as before.
   */
  group?: string;
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
 * Scoping context for the header's left slot — the thing every figure on the
 * screen is scoped to. A portal with no genuine scope passes NOTHING and gets
 * the page title. Do not invent chrome to fill this slot.
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
  children,
}: {
  role: string;
  navItems: NavItem[];
  scope?: HeaderScope;
  /** Command search. Pass only once a palette/endpoint actually exists. */
  search?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations();
  const { dir } = useFormatters();
  const tNav = (label: string) =>
    NAV_KEY[label] ? t(NAV_KEY[label] as Parameters<typeof t>[0]) : label;

  // Preserve declaration order, collapsing consecutive items that share a
  // group. A layout passing no groups yields one unlabelled section.
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
              // The scoping-context slot. §3.2 specifies the active financial
              // cycle here. It is NOT wired: periodStart/periodEnd exist only
              // per-invoice and per-payout, chosen by whoever generates a
              // batch — there is no global cycle entity, no "current cycle",
              // and no closed-ledger flag. Rendering a hardcoded range would
              // state a scope the system does not enforce. See design/HANDOFF.md.
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
            {/* §3.2 also specifies a command search with a ⌘K chip. Not
                rendered: no command palette is mounted, and this app has no
                search endpoint at all. A search box that searches nothing is
                the same class of lie as a nav entry with no destination. */}
            {search ?? null}
            <div className="hidden items-center gap-3 lg:flex">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
            <div className="lg:hidden">
              <HeaderQuickSettings />
            </div>
            {/* The notification bell is deliberately gone from the header: it
                lives in the nav group with a counted, named badge (§3.2). */}
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
