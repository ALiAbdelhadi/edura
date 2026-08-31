"use client";

import { EmptyState } from "@repo/ui/components/empty-state";
import { LoadError, SkeletonRows } from "@repo/ui/components/ledger";
import { ShieldAlert } from "lucide-react";
import { Direction } from "radix-ui";
import * as React from "react";

export type QueryLike = {
  isPending?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  refetch: () => unknown;
};

const STRINGS = {
  ar: {
    loadFailed: "تعذر تحميل البيانات.",
    retry: "إعادة المحاولة",
    denied: "ليس لديك صلاحية لعرض هذا المحتوى.",
    unavailable: "غير متاح حاليًا",
  },
  en: {
    loadFailed: "Couldn't load this data.",
    retry: "Try again",
    denied: "You don't have permission to view this.",
    unavailable: "Currently unavailable",
  },
} as const;

export function useQueryStrings() {
  const dir = Direction.useDirection();
  return STRINGS[dir === "rtl" ? "ar" : "en"];
}

function isDenied(error: unknown): boolean {
  const e = error as { statusCode?: number; apiErrorCode?: string } | undefined;
  return e?.statusCode === 403 || e?.apiErrorCode === "forbidden";
}

function errorMessage(error: unknown, fallback: string): React.ReactNode {
  const message = (error as { message?: string } | undefined)?.message;
  return message || fallback;
}

export function combineQueries(...queries: QueryLike[]): QueryLike {
  const failed = queries.find((q) => q.isError);
  return {
    isPending: queries.some((q) => q.isPending ?? q.isLoading ?? false),
    isError: Boolean(failed),
    error: failed?.error,
    refetch: () => {
      for (const q of queries) if (q.isError || !(q.isPending ?? q.isLoading)) q.refetch();
    },
  };
}

export function QuerySection({
  query,
  skeleton,
  empty,
  isEmpty,
  className,
  children,
}: {
  query: QueryLike;
  skeleton?: React.ReactNode;
  empty?: React.ReactNode;
  isEmpty?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const s = useQueryStrings();
  const pending = query.isPending ?? query.isLoading ?? false;
  if (pending) return <>{skeleton ?? <SkeletonRows className={className} />}</>;
  if (query.isError) {
    if (isDenied(query.error)) {
      return (
        <EmptyState
          tone="denied"
          icon={ShieldAlert}
          title={s.denied}
          className={className}
        />
      );
    }
    return (
      <LoadError
        message={errorMessage(query.error, s.loadFailed)}
        onRetry={() => query.refetch()}
        retryLabel={s.retry}
        className={className}
      />
    );
  }
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children}</>;
}
