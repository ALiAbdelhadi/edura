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
