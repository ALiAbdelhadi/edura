"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { useList } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { cn } from "@repo/ui/lib/utils";
/**
 * `/api/v1/me/children` selects `{ id, name, email, phone }` straight off the
 * user table — so the identifier is `id`.
 *
 * This used to read `c._id`, which is always undefined on that payload, so
 * `childId` never resolved and EVERY parent screen fell through to its "no
 * children registered" empty state even when children were linked. The bug was
 * invisible for as long as no demo parent had an approved link. `_id` is kept
 * as a fallback because other screens in this app still receive Refine-shaped
 * records that carry it.
 */
type ChildRecord = {
  id?: string;
  _id?: string;
  name?: string | null;
};

/**
 * Exported because the pay screen needs the SAME answer to "which child is
 * this row?". It was reading `c._id` on its own — the exact mistake documented
 * above, still live there after it was fixed here — so the payment
 * confirmation dialog never knew the child's name.
 */
export const childKey = (c: ChildRecord): string | null => c.id ?? c._id ?? null;

type ChildSelectorContextValue = {
  children: ChildRecord[];
  childId: string | null;
  setChildId: (id: string | null) => void;
  /** True until the list has actually arrived — including while a retry is paused. */
  isLoading: boolean;
  /** The list could not be fetched. Distinct from "this parent has no children". */
  failed: boolean;
};

const ChildSelectorContext = createContext<ChildSelectorContextValue>({
  children: [],
  childId: null,
  setChildId: () => {},
  isLoading: false,
  failed: false,
});

export function ChildSelectorProvider({ children: renderChildren }: { children: React.ReactNode }) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const { query, result } = useList({
    resource: "me-children",
    queryOptions: {
      // `networkMode: "always"` because the DEFAULT ("online") PAUSES a query
      // whose first attempt failed until React Query believes the browser is
      // back online — and a paused query reports `isLoading: false` with no
      // data. Every screen below then read an empty list and told the parent
      // they have no children, on the screen where they pay for one, with no
      // way back but a full reload. Observed: one request timing out (the ky
      // client gives up at 10s) put the list into `status:"pending",
      // fetchStatus:"paused"` while `navigator.onLine` was true throughout.
      //
      // With "always" the request simply retries and, if it keeps failing,
      // lands in `isError` — a state this provider can report honestly.
      networkMode: "always",
    },
  });
  const children = (result?.data ?? []) as ChildRecord[];
  const childId =
    selectedChildId || (children[0] ? childKey(children[0]) : null);

  // `isPending`, NOT `isLoading`. They differ in exactly the case that caused
  // the bug: a paused or otherwise not-yet-resolved query is `isPending` but
  // not `isLoading`, and reporting it as "loaded" is what turned a transport
  // failure into a false statement about the family.
  const isLoading = query.isPending;

  const value = useMemo(
    () => ({
      children,
      childId,
      setChildId: setSelectedChildId,
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

export function ChildSelectorBar() {
  const t = useTranslations();
  const { children, childId, setChildId, isLoading } = useChildSelector();

  if (isLoading || children.length <= 1) return null;

  // Which child is being shown scopes every figure on the page, so the control
  // is a labelled radiogroup rather than a row of loose buttons — a parent
  // reading a fee total needs the answer to "whose?" announced, not implied.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="eyebrow">{t("shared.childSelectorLabel")}</span>
      <div
        role="radiogroup"
        aria-label={t("shared.childSelectorLabel")}
        className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-rule bg-field p-1"
      >
        {children.map((c) => {
          const key = childKey(c);
          const active = key !== null && key === childId;
          const initial = (c.name || "?").charAt(0).toUpperCase();
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setChildId(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
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
                  active
                    ? "bg-indigo text-indigo-ink"
                    : "bg-rule-2 text-ink-3",
                )}
              >
                {initial}
              </span>
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
