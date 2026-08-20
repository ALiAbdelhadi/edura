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
          an icon flips if it points, not if it depicts).
          `size-5`, not the `size-4` every other header control uses (Ali,
          2026-08-20): this one is a 20px glyph in a 36px button because it is
          the only control on the header that changes the LAYOUT, and at 16px it
          read as a decoration sitting next to the title rather than as the
          handle for the panel beside it. */}
      <PanelLeft className="size-5 rtl:-scale-x-100" />
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
          <div key={group.label || gi} className="px-1.5 pb-1.5">
            {/* THE RAIL'S ONLY GROUPING DEVICE.
                At 48px the headings are hidden, so a 21-destination portal used
                to draw one undifferentiated column of icons and the runs a
                reader already knows by shape were gone. A hairline costs no
                width and restores them. It is `hidden` at full width — there the
                heading does this job and two devices would say the same thing
                twice. Never before the first group: a rule above the first item
                separates it from the header's own border, not from anything. */}
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
                  // Sticky, so the run you are inside keeps naming itself while
                  // you scroll a 21-item portal. It needs an opaque ground of
                  // its own — the items scroll UNDER it, and the sidebar panel's
                  // background is on an ancestor, which paints behind both.
                  // The separation from the first item is PADDING, not a
                  // margin, for the same reason: a margin is transparent, so a
                  // row scrolling past would show through the gap.
                  "sticky top-0 z-10 bg-(--chrome-surface)",
                  "transition-colors duration-(--chrome-fast) ease-(--chrome-ease)",
                  "hover:bg-(--chrome-surface-2)",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--chrome-ring)",
                  // Hidden in the icon rail: it is 48px wide, so a heading there
                  // would either truncate to nothing or force the rail open. The
                  // hairline above is what separates the runs there instead.
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
                        // `end-1`/`top-*` on this element are RTL-logical, so
                        // the badge itself must stay in the ambient (RTL)
                        // direction — that's what puts it at the icon's
                        // opposite corner instead of on top of it. `dir="ltr"`
                        // here previously flipped those same logical insets to
                        // their LTR reading, landing the badge exactly where
                        // the icon sits. Isolation belongs on the digits only:
                        // Latin, mono, tabular, bidi-isolated — the <Num> path
                        // from constitution §6.3. Arabic-Indic digits would
                        // fall silently out of the mono face, which ships no
                        // Arabic glyphs.
                        className="rounded-(--chrome-radius-sm) bg-(--chrome-accent-soft) font-(family-name:--chrome-mono) text-[11px] font-semibold text-(--chrome-accent-text) tabular-nums"
                      >
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

/* ── search, in the sidebar ───────────────────────────────────────────────── */

/**
 * ONE SEARCH PER VIEWPORT — the same rule the phone bar and the drawer already
 * live under, applied to the palette.
 *
 * The palette's only visible entry point used to be a pill in the content
 * header, which is the wrong end of the screen from the list it searches: the
 * center portal carries 19 destinations and superadmin 21, and by the time a
 * list is that long, scanning it is the slow path and typing is the fast one.
 * So the trigger moves next to the list, and the header's pill hides at `md`
 * (see the header below) rather than becoming its twin. Below `md` the sidebar
 * is a drawer, so the header keeps the pill and this row is not on screen.
 *
 * It renders as a nav row rather than as its own control on purpose: the rail
 * collapse, the 48px tooltip and the focus outline are then the ones every
 * other row already has, not a second implementation of each.
 */
/**
 * The expanded state's search — a FIELD beside the mark, not a menu row.
 *
 * The mark used to sit alone on a 44px row with the search under it, and alone
 * is exactly how it read: a small object floating in an empty band. Beside a
 * field it reads as a lockup, which is what the top of a sidebar is for. It
 * costs 24px of width (248 → 272) and gives back ~30px of height.
 *
 * A button that LOOKS like an input, deliberately: it opens the palette, and a
 * real <input> here would be a second search implementation — the thing the
 * palette exists to prevent. The affordance is the field; the mechanism stays
 * one.
 */
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
      {/* `min-w` so the Ctrl/⌘ swap after mount cannot resize the field. */}
      <Kbd className="min-w-11 shrink-0 justify-center">{shortcut}</Kbd>
    </button>
  );
}

/**
 * The RAIL's search. At 48px there is no room beside the mark, so the field
 * folds back into a nav row — the same square, the same tooltip and the same
 * focus outline every other rail icon has.
 */
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
          {/* `min-w` so the Ctrl/⌘ swap after mount cannot shift the row. */}
          <Kbd className="ms-auto min-w-11 justify-center group-data-[collapsible=icon]:hidden">
            {shortcut}
          </Kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/* ── identity, at the foot ────────────────────────────────────────────────── */

/**
 * WHO YOU ARE MOVED TO THE BOTTOM, AND LOGOUT MOVED INSIDE IT.
 *
 * Two things were wrong with the old arrangement, and one edit fixes both.
 * Identity sat directly under the mark, so the first ~56px of every portal —
 * the most valuable strip in the sidebar, the one the eye lands on — was spent
 * on a name that does not change and is already in the header's own avatar.
 * And `logout` held a permanent full-width row at the foot: a destructive
 * action, used once a day, drawn at the same weight as the screens used all
 * day, and the only red in the chrome.
 *
 * Both are now one row: identity is the visible thing (it is a label), logout
 * is one click behind it (it is an action). That is the arrangement every
 * desktop shell converged on, and it buys back roughly a destination's worth of
 * height at the top where the destinations are.
 */
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
              {/* Points at neither edge, so it does not mirror in RTL — it says
                  "this opens", not "this way". */}
              <ChevronsUpDown
                aria-hidden="true"
                className="ms-auto size-4 shrink-0 text-(--chrome-fg-subtle) group-data-[collapsible=icon]:hidden"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          {/* A Radix portal, appended to <body>, so it takes the chrome by its
              own class exactly as the palette dialog does — descent reaches it
              from nothing. */}
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

/* ── the shell ────────────────────────────────────────────────────────────── */

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
  /**
   * How many TARGETS the phone bar draws, "more" included — so `5` is four
   * destinations plus the sheet, and `6` is five plus the sheet.
   *
   * A prop rather than a constant because the right number is a property of
   * the PORTAL, not of the bar: it depends on how many destinations a role
   * opens daily and how long their labels are. Five destinations at 375px
   * leaves ~62px each, which fits a two-syllable Arabic label and an icon and
   * not much else — so a portal raising this owes a look at its own longest
   * label in both locales before it does.
   *
   * Defaults to 5, which is what every portal rendered before this was
   * configurable; leaving it unset changes nothing.
   */
  bottomNavMaxVisible?: number;
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
        {/* 64px — THE SAME HEIGHT AS THE CONTENT HEADER (Ali, 2026-08-20).
            It was 54 (a 48px row plus padding) against the header's 64, so the
            two hairlines sat ten pixels apart and the top of the app read as
            two unrelated bars that happened to be adjacent. They carry the same
            `--chrome-border` and now end at the same y, so they read as ONE
            rule crossing the whole window. If either height changes, the other
            has to change with it — that is the whole point of the number.
            The height is on the HEADER, not on the row inside it: box-sizing is
            border-box, so 64 here includes the hairline and both rules land on
            the same pixel. Sizing the child instead put the border a pixel
            below — visible as a step exactly where the two meet. */}
        <SidebarHeader className="h-16 gap-0 border-b border-(--chrome-border) p-0">
          {/* THE MARK ALONE — no wordmark beside it (Ali, 2026-08-14).
              Which of the two survives was not a toss-up: the collapsed rail is
              48px wide and hides the wordmark by design, so a header built on
              the word would be EMPTY in half of this component's two states,
              while the mark works in both.
              The consequence is that the mark is now the only thing naming the
              product here, so it is no longer decorative and carries a real
              `alt` again — see the note on the `logo` prop in each app's
              wrapper.
              ONE ROW with the search field (Ali, 2026-08-20). Identity had
              already moved to the foot (see <SidebarIdentity>); folding the
              mark and the search together is what turns the two rows it left
              behind into one, and gives the mark something to sit beside. */}
          <div className="flex h-full items-center gap-2 px-2 group-data-[collapsible=icon]:px-1.5">
            {logo}
            <SidebarSearchField
              label={strings.search}
              onOpen={() => palette.setOpen(true)}
            />
          </div>
        </SidebarHeader>

        {/* `py-1`, not `py-1.5`: the student portal measured 608px of nav
            against 604px of room on a 720px-tall laptop — a scrollbar for four
            pixels, which reads as a broken menu rather than a long one. The
            four pixels come off the list's own top and bottom padding, where
            nothing is separated by them, and not off the rows.
            `pb-0` for the same reason, once the rows grew to 32px: the footer
            below carries its own border AND its own 4px of padding, so the
            list's trailing padding was a second gap stacked on a gap that was
            already there. */}
        <SidebarContent className="gap-0 pt-1 pb-0">
          {/* Rail only, and it lives HERE rather than in the header for one
              reason: the header has to be exactly 64px in both states to keep
              its rule level with the content header's, and 36px of mark plus a
              30px row is 66. As a nav row it is also what it looks like at
              48px — the same square, tooltip and outline as every icon under
              it. Hidden at full width, where the field above does this job. */}
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
            {/* PHONE ONLY, since 2026-08-20. Above `md` the sidebar carries the
                search row and the rail carries its icon, so keeping this pill
                there would be two triggers for one palette — the same
                two-navigations-one-viewport defect the phone bar rule exists
                for. Below `md` the sidebar is a drawer, so this is the palette's
                only visible way in and it stays. */}
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
                  {/* Does NOT flip in RTL: a bell depicts an object. */}
                  <Bell className="size-4" />
                </Link>
              </Button>
              {unreadCount > 0 ? (
                <span
                  aria-hidden="true"
                  // Same trap as the sidebar badge: `-inset-e-1` is RTL-logical
                  // and must resolve against the ambient (RTL) direction, so
                  // `dir="ltr"` cannot live on this element — it would pin the
                  // dot to the bell's LTR corner instead of its RTL one.
                  // Isolation goes on the digits only.
                  className="absolute -top-1 -inset-e-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-(family-name:--chrome-mono) text-[10px] font-semibold text-white tabular-nums"
                >
                  <bdi dir="ltr">{unreadCount}</bdi>
                </span>
              ) : null}
            </div>
            {/* NO AVATAR HERE (Ali, 2026-08-20). Identity is named once, at the
                foot of the sidebar, where it is also the control that logs you
                out. The one that used to sit here was a plain <Avatar> with no
                handler and no label — it answered "who am I signed in as?" a
                second time and did nothing when clicked, which is the worst of
                both: it looks like a menu and is not one. */}
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
            maxVisible={bottomNavMaxVisible}
            linkAs={linkAs}
            navLabel={strings.dashboard}
            moreLabel={strings.more}
            moreTitle={strings.allSections}
            // The bar's presence HIDES the sidebar toggle on phones, so the
            // drawer holding identity and logout cannot be opened there. The
            // bar takes the sidebar's place, so it carries the sidebar's foot
            // too — otherwise a phone user of a barred portal has no way to
            // sign out at all.
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
