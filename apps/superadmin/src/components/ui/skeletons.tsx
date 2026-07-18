"use client";

import React from "react";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Card, CardContent } from "@repo/ui/components/card";


export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} aria-hidden>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-4 w-7/12" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  const gridStyle = { gridTemplateColumns: `repeat(${columns}, 1fr)` };
  return (
    <div role="status" aria-busy aria-label="Loading" className="w-full">
      <div
        className="mb-2 grid gap-4 rounded-md bg-muted px-4 py-3"
        style={gridStyle}
      >
        {Array.from({ length: columns }).map((_, c) => (
          <Skeleton key={c} className="h-3.5 w-full" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-4 border-b border-border p-4"
          style={gridStyle}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex w-full flex-col gap-4" role="status" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-[30%]" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6">
      <StatCardsSkeleton />
      <Card>
        <CardContent className="p-4">
          <TableSkeleton />
        </CardContent>
      </Card>
    </div>
  );
}
