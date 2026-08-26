"use client";

import { useList } from "@refinedev/core";
import { cn } from "@repo/ui/lib/utils";
import { IdCard } from "lucide-react";
import { useTranslations } from "next-intl";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * ONE child context for the whole parent portal.
 *
 * ── WHAT WAS WRONG ────────────────────────────────────────────────────────
 *
 * The portal had THREE ways of saying which child, and they shared no state:
 * this chip bar (rendered by five screens that each remembered to), Child
 * Safety's own card grid, and the `[studentId]` route param on the ID card. A
 * parent picked يوسف on Attendance, opened Child Safety, and was handed a
 * chooser starting from nothing.
 *
 * Worse, the selection was plain React state with `children[0]` as the
 * fallback. A push notification about يوسف's absence deep-links into
 * `/dashboard/parent/attendance`, the provider mounts fresh, and the screen
 * opens on نور — the notification said one thing and the screen showed
 * another, silently. That is a data-correctness bug, not a layout one, which
 * is why it is fixed first.
 *
 * ── HOW THE CHILD IS RESOLVED ─────────────────────────────────────────────
 *
 * In order, first valid wins. "Valid" always means "is an APPROVED child of
 * this parent" — the list comes from `me-children`, which is the server's
 * answer, so a stale storage value or a hand-typed URL cannot widen anything.
 *
 *   1. what the parent picked in this session
 *   2. `?studentId=` in the URL          ← what makes a deep link land right
 *   3. the last child they were reading  ← what makes a reload keep its place
 *   4. the first approved child
 *
 * ── WHY BOTH ARE READ IN AN EFFECT, AND NOT WITH `useSearchParams` ────────
 *
 * `localStorage` read during render is a hydration mismatch waiting to happen.
 * The URL is the more interesting one: the obvious tool is `useSearchParams`,
 * and it does not work HERE. This provider wraps the entire portal shell, and
 * calling that hook in it forces the whole subtree into a client-side bailout
 * — measured 2026-08-20 on `/dashboard/parent/attendance?studentId=…`, which
 * fetched the right child's record and then sat on a skeleton indefinitely,
 * with `me-children` re-issued four times as the tree remounted. Without the
 * query string the same page rendered in under a second.
 *
 * So the param is read once, on mount, from `window.location.search`. The cost
 * is that a CLIENT-SIDE navigation which changes `?studentId=` will not
 * re-adopt it — and nothing in the product performs one. The links that carry
 * a child id are push notifications and emails, which are always full page
 * loads, which is exactly when this runs.
 *
 * Neither source can flash the wrong child: the effect commits before the
 * async `me-children` query resolves, so there is no moment where the list is
 * populated and the preference is not yet known.
 *
 * ── WHAT THIS GRANTS ──────────────────────────────────────────────────────
 *
 * Nothing. Every per-child endpoint re-checks the link server-side
 * (`assertApprovedChild`, or the `parentStudentLink` lookup in each route).
 * This context only decides which of the parent's own children is on screen.
 */

const STORAGE_KEY = "edura.parent.childId";

type ChildRecord = {
  id?: string;
  _id?: string;
  name?: string | null;
};

export const childKey = (c: ChildRecord): string | null => c.id ?? c._id ?? null;

type ChildSelectorContextValue = {
  children: ChildRecord[];
  childId: string | null;
  /** The selected child's name, or "" — so a title can say WHOSE record it is. */
  childName: string;
  setChildId: (id: string | null) => void;
  isLoading: boolean;
  failed: boolean;
};

const ChildSelectorContext = createContext<ChildSelectorContextValue>({
  children: [],
  childId: null,
  childName: "",
  setChildId: () => {},
  isLoading: false,
  failed: false,
});

export function ChildSelectorProvider({
  children: renderChildren,
}: {
  children: React.ReactNode;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  /** `{ fromUrl, stored }` — both read once on mount. See the header. */
  const [onMount, setOnMount] = useState<{
    fromUrl: string | null;
    stored: string | null;
  }>({ fromUrl: null, stored: null });

  const { query, result } = useList({
    resource: "me-children",
    queryOptions: {
      networkMode: "always",
    },
  });
  const children = (result?.data ?? []) as ChildRecord[];

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private mode, or storage disabled. The context still works; it just
      // forgets between visits, which is the behaviour this replaces.
    }
    const fromUrl = new URLSearchParams(window.location.search).get("studentId");
    setOnMount({ fromUrl, stored });
  }, []);

  const has = (id: string | null | undefined): id is string =>
    Boolean(id) && children.some((c) => childKey(c) === id);

  const childId =
    (has(picked) ? picked : null) ??
    (has(onMount.fromUrl) ? onMount.fromUrl : null) ??
    (has(onMount.stored) ? onMount.stored : null) ??
    (children[0] ? childKey(children[0]) : null);

  useEffect(() => {
    if (!childId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, childId);
    } catch {
      // As above.
    }
  }, [childId]);

  const isLoading = query.isPending;

  const value = useMemo(
    () => ({
      children,
      childId,
      childName: children.find((c) => childKey(c) === childId)?.name ?? "",
      setChildId: setPicked,
      isLoading,
      failed: query.isError,
    }),
    [children, childId, isLoading, query.isError],
  );

  return (
    <ChildSelectorContext.Provider value={value}>
      {renderChildren}
    </ChildSelectorContext.Provider>
  );
}

export function useChildSelector() {
  return useContext(ChildSelectorContext);
}

/**
 * The routes whose content is ABOUT one child.
 *
 * Kept here rather than in the chrome so that the bar and the pages that read
 * `childId` are described by one list. Everything absent is account-level:
 * the parent's own wallet, their own messages, notifications, settings, the
 * linking screen, and the practice emulator — none of which change meaning
 * when a different child is selected.
 */
const PER_CHILD_ROUTES = [
  "/dashboard/parent",
  "/dashboard/parent/attendance",
  "/dashboard/parent/progress",
  "/dashboard/parent/fees",
  "/dashboard/parent/subscriptions",
  "/dashboard/parent/pay",
  "/dashboard/parent/oversight",
];

/**
 * "بتشوف: نور" — rendered ONCE by the portal chrome, above the page.
 *
 * ── WHY IT IS IN THE CHROME AND NOT IN FIVE PAGE HEADERS ──────────────────
 *
 * Because a screen that forgets to render it is a screen where a parent reads
 * figures about a child the app never names. Five screens rendered it; six did
 * not, and two of those six were about a child.
 *
 * ── WHY THE NAME SHOWS EVEN WITH ONE CHILD ────────────────────────────────
 *
 * The old bar returned `null` for a single-child parent — correct as a
 * *switcher*, wrong as a *label*: the whole portal was about one person who
 * was never named on any screen, and a screenshotted ledger with no name on it
 * proves nothing at a counter. So the name is always stated; only the chips
 * are conditional.
 */
export function ChildContextBar() {
  const t = useTranslations();
  const pathname = usePathname();
  const { children, childId, childName, setChildId, isLoading } =
    useChildSelector();

  if (isLoading || !childId) return null;
  if (!PER_CHILD_ROUTES.includes(pathname || "")) return null;

  const many = children.length > 1;

  return (
    // Chrome, not content: no card, no border, no fill. It measured ~90px of
    // a 375px screen as a bordered sheet, which put it in competition with the
    // hero directly below it for the one thing that matters at the top of a
    // phone. A line of text and a row of chips says the same thing in a third
    // of the height.
    <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="eyebrow shrink-0">{t("parentChild.viewing")}</span>

      {many ? (
        <div
          role="radiogroup"
          aria-label={t("shared.childSelectorLabel")}
          className="inline-flex flex-wrap items-center gap-1"
        >
          {children.map((c) => {
            const key = childKey(c);
            const active = key !== null && key === childId;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChildId(key)}
                className={cn(
                  // 40px tall: this is the control that decides whose money a
                  // parent is about to spend, and it is pressed with a thumb.
                  "inline-flex min-h-10 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo",
                  active
                    ? "bg-indigo-soft font-semibold text-indigo"
                    : "text-ink-2 hover:bg-rule-2",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-sm text-[10px] font-semibold",
                    active ? "bg-indigo text-indigo-ink" : "bg-rule-2 text-ink-3",
                  )}
                >
                  {(c.name || "?").charAt(0).toUpperCase()}
                </span>
                {c.name}
              </button>
            );
          })}
        </div>
      ) : (
        <span className="text-[13px] font-semibold text-ink">{childName}</span>
      )}

      {/* The card's only entry point used to be a link inside a table cell on
          the Children page — the portal's third way of naming a child. It is
          per-child, so it belongs to the child context. */}
      <Link
        href={`/dashboard/parent/children/${childId}/id`}
        className="ms-auto inline-flex min-h-10 items-center gap-1.5 text-[12px] text-ink-2 underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
      >
        <IdCard className="size-3.5 shrink-0" aria-hidden />
        {t("parentChild.card")}
      </Link>
    </div>
  );
}
