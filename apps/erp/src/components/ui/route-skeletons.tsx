import { Card, CardContent } from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";

export function PageHeaderSkeleton({ actions = true }: { actions?: boolean }) {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {actions ? <Skeleton className="h-9 w-32" /> : null}
    </div>
  );
}

function RowsSkeleton({ rows, columns }: { rows: number; columns: number }) {
  const gridStyle = { gridTemplateColumns: `repeat(${columns}, 1fr)` };
  return (
    <div className="w-full">
      <div
        className="mb-2 grid gap-4 rounded-md bg-field px-4 py-3"
        style={gridStyle}
      >
        {Array.from({ length: columns }).map((_, c) => (
          <Skeleton key={c} className="h-3.5 w-full" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-4 border-b border-rule p-4"
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

export function RouteSkeleton({
  rows = 6,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div role="status" aria-busy className="flex w-full flex-col gap-6">
      <PageHeaderSkeleton />
      <Card>
        <CardContent className="p-4">
          <RowsSkeleton rows={rows} columns={columns} />
        </CardContent>
      </Card>
    </div>
  );
}

export function ChartsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-busy className="flex w-full flex-col gap-6">
      <PageHeaderSkeleton actions={false} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} aria-hidden>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-4 w-7/12" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: count }).map((_, i) => (
          <Card key={i} aria-hidden>
            <CardContent className="space-y-4 p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div role="status" aria-busy className="flex w-full flex-col gap-6">
      <PageHeaderSkeleton actions={false} />
      <Card className="overflow-hidden p-0">
        <div className="grid h-[calc(100vh-250px)] min-h-140 grid-cols-1 md:grid-cols-3">
          <div className="flex min-h-0 flex-col gap-4 border-b border-rule p-4 md:border-b-0 md:border-e">
            <Skeleton className="h-9 w-full" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden min-h-0 flex-col bg-field/40 p-4 md:col-span-2 md:flex">
            <div className="flex-1 space-y-4">
              {[70, 45, 60, 35].map((w, i) => (
                <div
                  key={i}
                  className={i % 2 === 0 ? "flex" : "flex justify-end"}
                >
                  <Skeleton className="h-12" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </Card>
    </div>
  );
}