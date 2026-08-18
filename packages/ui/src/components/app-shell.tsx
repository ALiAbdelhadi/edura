"use client";

import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { BottomNav } from "@repo/ui/components/bottom-nav";
import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import {
  CommandPaletteTrigger,
  NavCommandPalette,
  useCommandPalette,
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

/* ════════════════════════════════════════════════════════════════════════════
 * THE SHELL — one implementation, both apps.
 *
 * `apps/erp` and `apps/superadmin` each carried their own copy of this file
 * (489 and 505 lines). They were near-identical twins and had already drifted
 * in the places nobody diffs: one drew its badge amber-on-amber-soft and the
 * other white-on-destructive, one used next/image and the other a bare <img>,
 * one remapped the guided tour's ids onto the phone bar and the other silently
 * did not. Every fix to the chrome had to be made twice and was, at best,
 * remembered twice.
 *
 * @repo/ui cannot import an app's routing, i18n or data layer, so everything
 * app-local arrives as a PROP: the locale-aware Link, the resolved pathname,
 * the nav translator, the chrome strings, the identity, the badge counts and
 * the logout action. That is the price of one implementation and it is the
 * right price — the alternative is the two copies that already drifted.
 * ════════════════════════════════════════════════════════════════════════════ */

export type NavItem = {
  href: string;
  icon: string;
  label: string;
  /**
   * Optional `data-tour` id, so the guided tour can point at this entry.
   * Opt-in and inert: an untagged item renders exactly as before, and the tour
   * degrades to a centred step when an id it wants is not on the page (which is
   * every phone, where this sidebar is a bottom bar instead).
   */
  tour?: string;
};

/**
 * A labelled run of destinations. An empty `label` is the head group — the
 * portal's own home, which sits above the first heading because it is the
 * portal itself and not a member of any one topic.
 */
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
  /** Palette heading for the head group, which has no label of its own. */
  searchFallbackHeading: string;
  /** Heading over the destinations once RECORDS share the list with them. */
  searchDestinationsHeading: string;
  searchSearching: string;
  searchTruncated: string;
  searchMasked: string;
};

/**
 * The record half of the palette, supplied by the app.
 *
 * @repo/ui does not fetch — it has no client, no locale-aware router and no
 * session. So the shell renders whatever the app hands it and reports the
 * query back up. An app that passes nothing gets the destination-only palette
 * it had before, which is also what every render before hydration shows.
 */
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

/**
 * Declared locally, exactly as `lib/cloudinary.ts` does it. @repo/ui is a
 * browser package and deliberately carries no node types, and TypeScript 7 no
 * longer auto-discovers ambient @types the way 5.x did. The `typeof` guard
 * below is real rather than ceremony: the literal text `process.env.NODE_ENV`
 * is what Next's bundler statically replaces, and nothing replaces it in a
 * plain-browser consumer of this package.
 */
declare const process: { env: Record<string, string | undefined> } | undefined;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/* ── persistence ──────────────────────────────────────────────────────────────
 * Both pieces of chrome state live in cookies rather than localStorage, for one
 * reason: a cookie is readable by the server, so whenever these layouts stop
 * being client components the same values can be rendered correctly on the
 * first paint with no further change here. localStorage could never do that.
 */

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

/**
 * Runs before the browser paints, so restoring persisted chrome state produces
 * no visible flash — the collapsed rail is already collapsed on the first frame
 * the user sees. A plain effect would paint expanded and then animate shut on
 * every single page load, which reads as a glitch rather than as a memory.
 */
const useBeforePaint =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/* ── header toggle ─────────────────────────────────────────────────────────── */

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
      {/* Flips in RTL: it points along the reading axis (constitution §6.4 —
          an icon flips if it points, not if it depicts). */}
      <PanelLeft className="size-4 rtl:-scale-x-100" />
    </Button>
  );
}

/* ── nav ──────────────────────────────────────────────────────────────────── */

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
  // In the icon rail the headings are hidden, so a collapsed group would hide
  // its destinations with NO affordance to reveal them — the rail has nothing
  // to click. That is the same class of defect the phone-bar reachability guard
  // exists for, so the rail always renders every group open.
  const isRail = !isMobile && state === "collapsed";

  return (
    <>
      {groups.map((group, gi) => {
        const isCollapsed = !isRail && collapsed.has(group.label);
        const headingId = group.label
          ? `nav-group-${group.label.replace(/[^a-z]/gi, "")}`
          : undefined;

        return (
          // The heading is a sibling of the <ul>, not a child of it. A <ul> may
          // contain only <li> (plus <script>/<template>), and the shell it
          // replaced put the group's <Eyebrow> straight inside SidebarMenu —
          // invalid markup that browsers forgive and assistive technology does
          // not have to.
          <div key={group.label || gi} className="px-2 py-2">
            {group.label ? (
              <button
                type="button"
                id={headingId}
                onClick={() => onToggleGroup(group.label)}
                aria-expanded={!isCollapsed}
                className={cn(
                  "mb-1.5 flex w-full items-center gap-1 rounded-(--chrome-radius-sm) px-2 py-0.5 text-start",
                  "transition-colors duration-(--chrome-fast) ease-(--chrome-ease)",
                  "hover:bg-(--chrome-surface-2)",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--chrome-ring)",
                  // Hidden in the icon rail: it is 48px wide, so a heading there
                  // would either truncate to nothing or force the rail open. The
                  // runs stay separated by the menus' own padding, which is the
                  // only separation a rail can carry.
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
                    // Rotation, not a swapped glyph, so the two states are the
                    // same object seen from two angles. It does NOT mirror in
                    // RTL — a disclosure points at the content below it, and
                    // "below" is not a reading-axis direction.
                    isCollapsed && "-rotate-90 rtl:rotate-90",
                  )}
                />
              </button>
            ) : null}

            {/* `hidden` on the <ul> ITSELF — not on a wrapper, and not merely
                visually. It is the honest state: a collapsed group is gone
                from the accessibility tree and from tab order, exactly as it
                is gone from the eye, and `aria-expanded` on the heading above
                says so. (An earlier draft wrapped the items in a `display:
                contents` <div> to keep them "findable". They are not — `hidden`
                removes an element from find-in-page and from the a11y tree just
                as unmounting does — so it bought nothing and put an invalid
                <div> inside a <ul>.)
                Nothing becomes unreachable: the ⌘K palette is built from the
                nav DATA, not from the DOM, so every collapsed destination is
                still two keystrokes away. */}
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
                          // On mobile the sidebar is an overlay, so it must get
                          // out of the way once a destination is picked.
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <Icon />
                        <span>{translateNav(item.label)}</span>
                      </Link>
                    </SidebarMenuButton>
                    {count ? (
                      <SidebarMenuBadge
                        // Latin digits, mono, tabular, bidi-isolated — the
                        // <Num> path from constitution §6.3. Arabic-Indic
                        // digits would fall silently out of the mono face,
                        // which ships no Arabic glyphs.
                        dir="ltr"
                        className="rounded-(--chrome-radius-sm) bg-(--chrome-accent-soft) font-(family-name:--chrome-mono) text-[11px] font-semibold text-(--chrome-accent-text) tabular-nums"
                      >
                        {count}
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

/* ── the shell ────────────────────────────────────────────────────────────── */

export function AppShell({
  role,
  roleLabel,
  displayName,
  groups: groupsProp,
  navItems,
  bottomNav,
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
  /** Grouped list. Pass this OR `navItems`, never both. */
  groups?: NavGroup[];
  /** Flat list, for a portal that has not outgrown ~8 destinations. */
  navItems?: NavItem[];
  /**
   * Phone chrome. Hrefs in BAR ORDER, drawn from the nav — the bar's own
   * `maxVisible` decides how many get a slot and puts the remainder behind
   * "more", so this is the full list, not the first four.
   *
   * LIST EVERY href. Passing this hides the sidebar toggle on phones, so an
   * href left out is a destination a phone user cannot reach.
   */
  bottomNav?: string[];
  /** href → count. Resolved by the app; @repo/ui owns no data layer. */
  badges?: Record<string, number>;
  notificationsHref: string;
  unreadCount?: number;
  dir: "rtl" | "ltr";
  locale: "ar" | "en";
  /** Already stripped of its locale prefix by the app's own router. */
  pathname: string;
  linkAs: React.ElementType;
  translateNav: (label: string) => string;
  strings: AppShellStrings;
  onLogout: () => void;
  /** Router push, for the command palette. */
  onNavigate: (href: string) => void;
  logo: React.ReactNode;
  headerSettings?: React.ReactNode;
  headerSettingsCompact?: React.ReactNode;
  moreTour?: string;
  /** Record search. Omit for the destination-only palette. */
  search?: AppShellSearch;
  children: React.ReactNode;
}) {
  const Link = linkAs;

  // One flat list feeds every derivation below (active item, header title, the
  // phone bar, the palette, the reachability guard) so grouping stays a
  // RENDERING concern. If a group could hide a destination from the bar's
  // exhaustiveness check, grouping would have become a way to make a screen
  // unreachable.
  const groups: NavGroup[] = groupsProp ?? [
    { label: "", items: navItems ?? [] },
  ];
  const flatNav: NavItem[] = groups.flatMap((g) => g.items);

  /* — rail collapse, restored — */
  // `SidebarProvider` has always WRITTEN `sidebar_state`; nothing ever read it,
  // so a collapsed rail re-expanded on every full page load and the control
  // looked broken to anyone who used it. Reading it here is the other half.
  const [open, setOpen] = React.useState(true);
  useBeforePaint(() => {
    const stored = readCookie("sidebar_state");
    if (stored === "true" || stored === "false") setOpen(stored === "true");
  }, []);

  /* — collapsed groups, per role — */
  // Per ROLE, not per user: it is a property of the menu in front of you, and
  // somebody who holds two portals means two different menus.
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

  /* — active destination — */
  const path = pathname || "/";
  const selectedKey =
    flatNav.find((item) => path === item.href)?.href ||
    [...flatNav]
      .filter((item) => path === item.href || path.startsWith(item.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ||
    flatNav[0]?.href;

  const screenLabel =
    flatNav.find((item) => item.href === selectedKey)?.label || "Dashboard";

  /* — badges — */
  // One stable string stands in for the nav's identity, so the memos below (and
  // the dev guard further down) depend on a primitive rather than on an array
  // rebuilt every render. It also means no `exhaustive-deps` escape hatch: a
  // suppressed dependency warning in the one component every portal renders is
  // how a stale badge count outlives the page it belongs to.
  const navKey = flatNav.map((i) => i.href).join("|");
  const notificationsNavHref = navKey
    .split("|")
    .find((href) => href.includes("notifications"));

  // The notifications count is folded in here rather than special-cased in the
  // renderer, so the sidebar, the phone bar and the palette all read ONE map
  // and cannot disagree about what a destination is carrying.
  const resolvedBadges = React.useMemo(() => {
    const map: Record<string, number> = { ...badges };
    if (unreadCount > 0 && notificationsNavHref) {
      map[notificationsNavHref] = unreadCount;
    }
    return map;
  }, [badges, unreadCount, notificationsNavHref]);

  /* — phone bar — */
  // A SUBSET of the same nav, never a second information architecture: a
  // destination that exists only on the phone is one desktop users cannot find.
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
        // A DISTINCT id from the sidebar's: both navigations are in the DOM at
        // the same time (the bar is `md:hidden`, the sidebar hides below `md`),
        // so `nav-grades` and `bar-grades` must not collide — the tour picks
        // whichever of the two is actually visible.
        ...(i.tour ? { tour: i.tour.replace(/^nav-/, "bar-") } : {}),
        ...(badge
          ? { badge, badgeLabel: `${translateNav(i.label)} (${badge})` }
          : {}),
      };
    });

  const hasPhoneNav = bottomNavItems.length > 0;

  /* — palette — */
  const palette = useCommandPalette();
  // The query is controlled by the app when it wants records, and by the shell
  // when it does not. Keeping the local state UNCONDITIONALLY (rather than
  // behind a `search ?` ternary) is what lets an app adopt or drop the record
  // half without this component changing its hook order.
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

  /* — dev-only reachability guard — */
  // Hiding the toggle turns a missing href from an ordering preference into an
  // unreachable destination, and these navs grow a screen at a time.
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
        // Also on the Sidebar and not only the provider: the phone drawer
        // renders through a Radix portal, outside this subtree, so it inherits
        // nothing from the provider. Forwarded by the primitive since the fix
        // in sidebar.tsx.
        className="chrome"
      >
        <SidebarHeader className="gap-0 border-b border-(--chrome-border)">
          {/* THE MARK ALONE — no wordmark beside it (Ali, 2026-08-14).
              Which of the two survives was not a toss-up: the collapsed rail is
              48px wide and hides the wordmark by design, so a header built on
              the word would be EMPTY in half of this component's two states,
              while the mark works in both.
              The consequence is that the mark is now the only thing naming the
              product here, so it is no longer decorative and carries a real
              `alt` again — see the note on the `logo` prop in each app's
              wrapper. */}
          <div className="flex h-12 items-center px-1">{logo}</div>
          <div className="flex items-center gap-2 px-1 pb-2">
            <Avatar>
              <AvatarFallback className="bg-(--chrome-accent) font-semibold text-(--chrome-accent-fg)">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold text-(--chrome-fg)">
                {displayName}
              </p>
              <p className="truncate text-xs text-(--chrome-fg-muted)">
                {roleLabel}
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
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

        <SidebarFooter className="border-t border-(--chrome-border)">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onLogout}
                tooltip={strings.logout}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/10 active:text-destructive"
              >
                <LogOut />
                <span>{strings.logout}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0">
        <header className="chrome flex h-16 shrink-0 items-center justify-between gap-2 border-b border-(--chrome-border) bg-(--chrome-surface) px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <HeaderSidebarToggle
              desktopOnly={hasPhoneNav}
              strings={strings}
            />
            {/* The rule separates the toggle from the title, so it goes where
                the toggle goes. */}
            <div
              className={cn(
                "h-5 w-px shrink-0 bg-(--chrome-border)",
                hasPhoneNav && "hidden md:block",
              )}
            />
            {/* 22px, up from 18px (Ali, 2026-08-14). It is the only thing on
                the header that names where you are, and at 18px in the display
                face it sat at the same weight as the controls beside it. */}
            <h1 className="truncate font-(family-name:--chrome-display) text-[22px] font-semibold text-(--chrome-fg) ltr:tracking-(--chrome-display-track)">
              {translateNav(screenLabel)}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <CommandPaletteTrigger
              onClick={() => palette.setOpen(true)}
              label={strings.search}
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
                  {/* Does NOT flip in RTL: a bell depicts an object. */}
                  <Bell className="size-4" />
                </Link>
              </Button>
              {unreadCount > 0 ? (
                <span
                  dir="ltr"
                  aria-hidden="true"
                  className="absolute -top-1 -inset-e-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-(family-name:--chrome-mono) text-[10px] font-semibold text-white tabular-nums"
                >
                  {unreadCount}
                </span>
              ) : null}
            </div>
            <Avatar>
              <AvatarFallback className="bg-(--chrome-accent) font-semibold text-(--chrome-accent-fg)">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
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

        {/* Phone chrome. Hidden at md+ by the component itself, so the sidebar
            remains the only navigation on desktop and the two never coexist. */}
        {hasPhoneNav ? (
          <BottomNav
            items={bottomNavItems}
            activeKey={selectedKey}
            maxVisible={5}
            linkAs={linkAs}
            navLabel={strings.dashboard}
            moreLabel={strings.more}
            moreTitle={strings.allSections}
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
