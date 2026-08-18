"use client";

import { useList } from "@refinedev/core";
import { cn } from "@repo/ui/lib/utils";
import { useTranslations } from "next-intl";
import React, { createContext, useContext, useMemo, useState } from "react";

type ChildRecord = {
  id?: string;
  _id?: string;
  name?: string | null;
};

export const childKey = (c: ChildRecord): string | null => c.id ?? c._id ?? null;

type ChildSelectorContextValue = {
  children: ChildRecord[];
  childId: string | null;
  setChildId: (id: string | null) => void;
  isLoading: boolean;
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
      networkMode: "always",
    },
  });
  const children = (result?.data ?? []) as ChildRecord[];
  const childId =
    selectedChildId || (children[0] ? childKey(children[0]) : null);

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
