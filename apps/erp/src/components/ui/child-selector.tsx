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

const PER_CHILD_ROUTES = [
  "/dashboard/parent",
  "/dashboard/parent/attendance",
  "/dashboard/parent/progress",
  "/dashboard/parent/fees",
  "/dashboard/parent/subscriptions",
  "/dashboard/parent/pay",
  "/dashboard/parent/oversight",
];

export function ChildContextBar() {
  const t = useTranslations();
  const pathname = usePathname();
  const { children, childId, childName, setChildId, isLoading } =
    useChildSelector();

  if (isLoading || !childId) return null;
  if (!PER_CHILD_ROUTES.includes(pathname || "")) return null;

  const many = children.length > 1;

  return (
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
