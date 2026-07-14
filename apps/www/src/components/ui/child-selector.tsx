"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { useList } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { cn } from "@repo/ui/lib/utils";
type ChildSelectorContextValue = {
  children: any[];
  childId: string | null;
  setChildId: (id: string | null) => void;
  isLoading: boolean;
};

const ChildSelectorContext = createContext<ChildSelectorContextValue>({
  children: [],
  childId: null,
  setChildId: () => {},
  isLoading: false,
});

export function ChildSelectorProvider({ children: renderChildren }: { children: React.ReactNode }) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const { query, result } = useList({ resource: "me-children" });
  const children = (result?.data ?? []) as any[];
  const childId = selectedChildId || (children[0]?._id ?? null);

  const value = useMemo(
    () => ({
      children,
      childId,
      setChildId: setSelectedChildId,
      isLoading: query.isLoading,
    }),
    [children, childId, query.isLoading],
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
      <span className="text-sm font-medium text-muted-foreground">
        {t("shared.childSelectorLabel")}
      </span>
      <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-muted p-1">
        {children.map((c: any) => {
          const active = c._id === childId;
          const initial = (c.name || "?").charAt(0).toUpperCase();
          return (
            <button
              key={c._id}
              type="button"
              onClick={() => setChildId(c._id)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  active
                    ? "gradient-primary text-primary-foreground"
                    : "bg-background text-muted-foreground",
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
