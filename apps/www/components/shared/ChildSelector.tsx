"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { useList } from "@refinedev/core";
import { useI18n } from "@/components/providers/I18nProvider";

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
  const { t } = useI18n();
  const { children, childId, setChildId, isLoading } = useChildSelector();

  if (isLoading || children.length <= 1) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <span style={{ fontWeight: 600, marginRight: 8 }}>{t("shared.childSelectorLabel")}:</span>
      <select
        value={childId ?? ""}
        onChange={(e) => setChildId(e.target.value || null)}
        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d9d9d9" }}
      >
        {children.map((c: any) => (
          <option key={c._id} value={c._id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
