"use client";

import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { BottomNav } from "@repo/ui/components/bottom-nav";
import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Kbd } from "@repo/ui/components/kbd";
import {
  CommandPaletteTrigger,
  NavCommandPalette,
  useCommandPalette,
  usePaletteShortcutLabel,
  type PaletteGroup,
  type PaletteRemote,
} from "@repo/ui/components/nav-command-palette";
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
import { cn } from "@repo/ui/lib/utils";
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
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
  Sparkles,
  Star,
  User,
  Users,
  Wallet as WalletIcon,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

export type NavItem = {
  href: string;
  icon: string;
  label: string;
  tour?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export type AppShellStrings = {
  collapseSidebar: string;
  expandSidebar: string;
  logout: string;
  notifications: string;
  dashboard: string;
  more: string;
  allSections: string;
  search: string;
  searchPlaceholder: string;
  searchEmpty: string;
  searchFallbackHeading: string;
  searchDestinationsHeading: string;
  searchSearching: string;
  searchTruncated: string;
  searchMasked: string;
};

export type AppShellSearch = {
  query: string;
  onQueryChange: (q: string) => void;
  remote?: PaletteRemote;
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
  sparkles: Sparkles,
};

declare const process: { env: Record<string, string | undefined> } | undefined;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const GROUPS_COOKIE_PREFIX = "edura_nav_groups_";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

const useBeforePaint =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function HeaderSidebarToggle({
  desktopOnly,
  strings,
}: {
  desktopOnly: boolean;
  strings: AppShellStrings;
}) {
  const { toggleSidebar, isMobile, openMobile, state } = useSidebar();
  const expanded = isMobile ? openMobile : state === "expanded";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={desktopOnly ? "hidden md:inline-flex" : undefined}
      onClick={toggleSidebar}
      aria-label={expanded ? strings.collapseSidebar : strings.expandSidebar}
      aria-expanded={expanded}
    >
      <PanelLeft className="size-5 rtl:-scale-x-100" />
    </Button>
  );
}

function SidebarNav({
  groups,
  selectedKey,
  badges,
  collapsed,
  onToggleGroup,
  translateNav,
  locale,
  linkAs: Link,
}: {
  groups: NavGroup[];
  selectedKey?: string;
  badges: Record<string, number>;
  collapsed: ReadonlySet<string>;
  onToggleGroup: (label: string) => void;
  translateNav: (label: string) => string;
  locale: "ar" | "en";
  linkAs: React.ElementType;
}) {
  const { isMobile, state, setOpenMobile } = useSidebar();
  const isRail = !isMobile && state === "collapsed";

  return (
    <>
      {groups.map((group, gi) => {
        const isCollapsed = !isRail && collapsed.has(group.label);
        const headingId = group.label
          ? `nav-group-${group.label.replace(/[^a-z]/gi, "")}`
          : undefined;

        return (
          <div key={group.label || gi} className="px-1.5 pb-1.5">
            {gi > 0 ? (
              <div
                aria-hidden="true"
                className="mx-auto mb-1.5 hidden h-px w-6 bg-(--chrome-border) group-data-[collapsible=icon]:block"
              />
            ) : null}
            {group.label ? (
              <button
                type="button"
                id={headingId}
                onClick={() => onToggleGroup(group.label)}
                aria-expanded={!isCollapsed}
                className={cn(
                  "flex w-full items-center gap-1 rounded-(--chrome-radius-sm) px-2 pt-0.5 pb-1 text-start",
                  "sticky top-0 z-10 bg-(--chrome-surface)",
                  "transition-colors duration-(--chrome-fast) ease-(--chrome-ease)",
                  "hover:bg-(--chrome-surface-2)",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--chrome-ring)",
                  "group-data-[collapsible=icon]:hidden",
                )}
              >
                <Eyebrow locale={locale} className="min-w-0 flex-1 truncate">
                  {translateNav(group.label)}
                </Eyebrow>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0 text-(--chrome-fg-subtle)",
                    "transition-transform duration-(--chrome-base) ease-(--chrome-ease)",
                    isCollapsed && "-rotate-90 rtl:rotate-90",
                  )}
                />
              </button>
            ) : null}

            <SidebarMenu hidden={isCollapsed}>
              {group.items.map((item) => {
                const Icon = iconMap[item.icon] || LayoutGrid;
                const isActive = item.href === selectedKey;
                const count = badges[item.href];
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={translateNav(item.label)}
                    >
                      <Link
                        href={item.href}
                        data-tour={item.tour}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <Icon />
                        <span>{translateNav(item.label)}</span>
                      </Link>
                    </SidebarMenuButton>
                    {count ? (
                      <SidebarMenuBadge className="rounded-(--chrome-radius-sm) bg-(--chrome-accent-soft) font-(family-name:--chrome-mono) text-[11px] font-semibold text-(--chrome-accent-text) tabular-nums">
                        <bdi dir="ltr">{count}</bdi>
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </div>
        );
      })}
    </>
  );
}

function SidebarSearchField({
  label,
  onOpen,
}: {
  label: string;
  onOpen: () => void;
}) {
  const shortcut = usePaletteShortcutLabel();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      aria-keyshortcuts="Meta+K Control+K"
      className="chrome-search flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5 group-data-[collapsible=icon]:hidden"
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-start text-[13px]">
        {label}
      </span>
      <Kbd className="min-w-11 shrink-0 justify-center">{shortcut}</Kbd>
    </button>
  );
}

function SidebarSearchRow({
  label,
  onOpen,
}: {
  label: string;
  onOpen: () => void;
}) {
  const shortcut = usePaletteShortcutLabel();
  return (
    <SidebarMenu className="hidden px-1.5 pb-1 group-data-[collapsible=icon]:block">
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={onOpen}
          tooltip={label}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search />
          <span>{label}</span>
          <Kbd className="ms-auto min-w-11 justify-center group-data-[collapsible=icon]:hidden">
            {shortcut}
          </Kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function SidebarIdentity({
  displayName,
  roleLabel,
  logoutLabel,
  onLogout,
}: {
  displayName: string;
  roleLabel: string;
  logoutLabel: string;
  onLogout: () => void;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={`${displayName} — ${roleLabel}`}
              className="data-[state=open]:bg-(--chrome-surface-2)"
            >
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-(--chrome-accent) text-xs font-semibold text-(--chrome-accent-fg)">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-start leading-tight">
                <span className="truncate text-[13px] font-semibold text-(--chrome-fg)">
                  {displayName}
                </span>
                <span className="truncate text-[11px] text-(--chrome-fg-muted)">
                  {roleLabel}
                </span>
              </span>
              <ChevronsUpDown
                aria-hidden="true"
                className="ms-auto size-4 shrink-0 text-(--chrome-fg-subtle) group-data-[collapsible=icon]:hidden"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="chrome-surface w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-(--chrome-fg)">
                {displayName}
              </span>
              <span className="block truncate text-[11px] font-normal text-(--chrome-fg-muted)">
                {roleLabel}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onLogout}>
              <LogOut />
              {logoutLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppShell({
  role,
  roleLabel,
  displayName,
  groups: groupsProp,
  navItems,
  bottomNav,
  bottomNavMaxVisible = 5,
  badges = {},
  notificationsHref,
  unreadCount = 0,
  dir,
  locale,
  pathname,
  linkAs,
  translateNav,
  strings,
  onLogout,
  onNavigate,
  logo,
  headerSettings,
  headerSettingsCompact,
  moreTour,
  search,
  children,
}: {
  role: string;
  roleLabel: string;
  displayName: string;
  groups?: NavGroup[];
  navItems?: NavItem[];
  bottomNav?: string[];
  bottomNavMaxVisible?: number;
  badges?: Record<string, number>;
  notificationsHref: string;
  unreadCount?: number;
  dir: "rtl" | "ltr";
  locale: "ar" | "en";
  pathname: string;
  linkAs: React.ElementType;
  translateNav: (label: string) => string;
  strings: AppShellStrings;
  onLogout: () => void;
  onNavigate: (href: string) => void;
  logo: React.ReactNode;
  headerSettings?: React.ReactNode;
  headerSettingsCompact?: React.ReactNode;
  moreTour?: string;
  search?: AppShellSearch;
  children: React.ReactNode;
}) {
  const Link = linkAs;
  const groups: NavGroup[] = groupsProp ?? [
    { label: "", items: navItems ?? [] },
  ];
  const flatNav: NavItem[] = groups.flatMap((g) => g.items);
  const [open, setOpen] = React.useState(true);
  useBeforePaint(() => {
    const stored = readCookie("sidebar_state");
    if (stored === "true" || stored === "false") setOpen(stored === "true");
  }, []);

  const groupsCookie = `${GROUPS_COOKIE_PREFIX}${role}`;
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(
    () => new Set(),
  );
  useBeforePaint(() => {
    const stored = readCookie(groupsCookie);
    if (stored) setCollapsedGroups(new Set(stored.split("|").filter(Boolean)));
  }, [groupsCookie]);

  const toggleGroup = React.useCallback(
    (label: string) => {
      setCollapsedGroups((previous) => {
        const next = new Set(previous);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        writeCookie(groupsCookie, [...next].join("|"));
        return next;
      });
    },
    [groupsCookie],
  );

  const path = pathname || "/";
  const selectedKey =
    flatNav.find((item) => path === item.href)?.href ||
    [...flatNav]
      .filter((item) => path === item.href || path.startsWith(item.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ||
    flatNav[0]?.href;

  const screenLabel =
    flatNav.find((item) => item.href === selectedKey)?.label || "Dashboard";

  const navKey = flatNav.map((i) => i.href).join("|");
  const notificationsNavHref = navKey
    .split("|")
    .find((href) => href.includes("notifications"));

  const resolvedBadges = React.useMemo(() => {
    const map: Record<string, number> = { ...badges };
    if (unreadCount > 0 && notificationsNavHref) {
      map[notificationsNavHref] = unreadCount;
    }
    return map;
  }, [badges, unreadCount, notificationsNavHref]);

  const bottomNavItems = (bottomNav ?? [])
    .map((href) => flatNav.find((i) => i.href === href))
    .filter((i): i is NavItem => Boolean(i))
    .map((i) => {
      const Icon = iconMap[i.icon] || LayoutGrid;
      const badge = resolvedBadges[i.href];
      return {
        key: i.href,
        href: i.href,
        label: translateNav(i.label),
        icon: <Icon className="size-5" />,
        ...(i.tour ? { tour: i.tour.replace(/^nav-/, "bar-") } : {}),
        ...(badge
          ? { badge, badgeLabel: `${translateNav(i.label)} (${badge})` }
          : {}),
      };
    });

  const hasPhoneNav = bottomNavItems.length > 0;

  const palette = useCommandPalette();
  const [localQuery, setLocalQuery] = React.useState("");
  const query = search ? search.query : localQuery;
  const setQuery = search ? search.onQueryChange : setLocalQuery;
  const paletteGroups: PaletteGroup[] = groups
    .filter((g) => g.items.length)
    .map((g) => ({
      heading: g.label ? translateNav(g.label) : "",
      items: g.items.map((i) => {
        const Icon = iconMap[i.icon] || LayoutGrid;
        return {
          href: i.href,
          label: i.label,
          translated: translateNav(i.label),
          icon: <Icon className="size-4" />,
          badge: resolvedBadges[i.href],
        };
      }),
    }));

  const barKey = (bottomNav ?? []).join("|");
  React.useEffect(() => {
    if (typeof process === "undefined") return;
    if (process.env.NODE_ENV === "production" || !barKey) return;
    const bar = barKey.split("|");
    const missing = navKey.split("|").filter((href) => !bar.includes(href));
    if (missing.length) {
      console.error(
        `[AppShell] role="${role}": ${missing.length} destination(s) are in the sidebar but not in \`bottomNav\`, so they are UNREACHABLE on phones (the sidebar toggle is hidden wherever a bar exists). Add them to the bar order:\n  ${missing.join("\n  ")}`,
      );
    }
  }, [role, navKey, barKey]);

  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      className="chrome h-svh overflow-hidden"
    >
      <Sidebar
        side={dir === "rtl" ? "right" : "left"}
        collapsible="icon"
        className="chrome"
      >
        <SidebarHeader className="h-16 gap-0 border-b border-(--chrome-border) p-0">
          <div className="flex h-full items-center gap-2 px-2 group-data-[collapsible=icon]:px-1.5">
            {logo}
            <SidebarSearchField
              label={strings.search}
              onOpen={() => palette.setOpen(true)}
            />
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-0 pt-1 pb-0">
          <SidebarSearchRow
            label={strings.search}
            onOpen={() => palette.setOpen(true)}
          />
          <SidebarNav
            groups={groups}
            selectedKey={selectedKey}
            badges={resolvedBadges}
            collapsed={collapsedGroups}
            onToggleGroup={toggleGroup}
            translateNav={translateNav}
            locale={locale}
            linkAs={linkAs}
          />
        </SidebarContent>

        <SidebarFooter className="border-t border-(--chrome-border) p-1">
          <SidebarIdentity
            displayName={displayName}
            roleLabel={roleLabel}
            logoutLabel={strings.logout}
            onLogout={onLogout}
          />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0">
        <header className="chrome flex h-16 shrink-0 items-center justify-between gap-2 border-b border-(--chrome-border) bg-(--chrome-surface) px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <HeaderSidebarToggle
              desktopOnly={hasPhoneNav}
              strings={strings}
            />
            <div
              className={cn(
                "h-5 w-px shrink-0 bg-(--chrome-border)",
                hasPhoneNav && "hidden md:block",
              )}
            />
            <h1 className="truncate font-(family-name:--chrome-display) text-[22px] font-semibold text-(--chrome-fg) ltr:tracking-(--chrome-display-track)">
              {translateNav(screenLabel)}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <CommandPaletteTrigger
              onClick={() => palette.setOpen(true)}
              label={strings.search}
              className="md:hidden"
            />
            {headerSettings ? (
              <div className="hidden items-center gap-3 lg:flex">
                {headerSettings}
              </div>
            ) : null}
            {headerSettingsCompact ? (
              <div className="lg:hidden">{headerSettingsCompact}</div>
            ) : null}
            <div className="relative">
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label={`${strings.notifications}${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
              >
                <Link href={notificationsHref}>
                  <Bell className="size-4" />
                </Link>
              </Button>
              {unreadCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -inset-e-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-(family-name:--chrome-mono) text-[10px] font-semibold text-white tabular-nums"
                >
                  <bdi dir="ltr">{unreadCount}</bdi>
                </span>
              ) : null}
            </div>
          </div>
        </header>

        <div
          tabIndex={0}
          role="region"
          aria-label={translateNav(screenLabel)}
          className="min-h-70 min-w-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8"
        >
          {children}
        </div>

        {hasPhoneNav ? (
          <BottomNav
            items={bottomNavItems}
            activeKey={selectedKey}
            maxVisible={bottomNavMaxVisible}
            linkAs={linkAs}
            navLabel={strings.dashboard}
            moreLabel={strings.more}
            moreTitle={strings.allSections}
            account={{
              displayName,
              roleLabel,
              logoutLabel: strings.logout,
              onLogout,
            }}
            {...(moreTour ? { moreTour } : {})}
          />
        ) : null}
      </SidebarInset>

      <NavCommandPalette
        open={palette.open}
        onOpenChange={palette.setOpen}
        groups={paletteGroups}
        onSelect={onNavigate}
        locale={locale}
        query={query}
        onQueryChange={setQuery}
        {...(search?.remote ? { remote: search.remote } : {})}
        strings={{
          title: strings.search,
          placeholder: strings.searchPlaceholder,
          empty: strings.searchEmpty,
          fallbackHeading: strings.searchFallbackHeading,
          destinationsHeading: strings.searchDestinationsHeading,
          searching: strings.searchSearching,
          truncated: strings.searchTruncated,
          masked: strings.searchMasked,
        }}
      />
    </SidebarProvider>
  );
}

export default AppShell;