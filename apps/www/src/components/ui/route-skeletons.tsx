import { Card, CardContent } from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";

/**
 * Route-level streaming fallbacks rendered by `loading.tsx`.
 *
 * Deliberately SERVER components, which is why they live here instead of in
 * `./skeletons.tsx`: that kit is `"use client"` (TableSkeleton reads an i18n
 * label via useTranslations), so a fallback built from it would only be a
 * client reference in the RSC payload — it would ship JS and paint after
 * hydration rather than arriving in the streamed HTML. These shapes carry no
 * text, so they need no translation and can render on the server: the skeleton
 * is in the first byte of HTML and costs zero client JS.
 *
 * The client kit stays as-is for in-screen loading states, where the component
 * is already inside a client tree.
 *
 * Everything here is presentation only — no data, no session, no fetch. The
 * shapes are empty by construction; they never preview real content.
 */

/** Mirrors <PageHeader> — title, description, and a trailing action slot. */
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

/** Server-side twin of the client kit's TableSkeleton (no i18n label). */
function RowsSkeleton({ rows, columns }: { rows: number; columns: number }) {
  const gridStyle = { gridTemplateColumns: `repeat(${columns}, 1fr)` };
  return (
    <div className="w-full">
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

/**
 * The generic fallback. One boundary covers every page in a role segment, so
 * it mirrors the shape those pages share (header + a card of rows) rather than
 * any single screen. Screens with a distinct layout get their own loading.tsx.
 */
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

/** Mirrors the analytics screens — a stat row above a grid of chart cards. */
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

/**
 * Mirrors the two-pane messaging layout (conversation list + thread), whose
 * grid metrics match chat-screen.tsx so the swap does not shift layout. The
 * generic RouteSkeleton would read as a table here.
 */
export function ChatSkeleton() {
  return (
    <div role="status" aria-busy className="flex w-full flex-col gap-6">
      <PageHeaderSkeleton actions={false} />
      <Card className="overflow-hidden p-0">
        <div className="grid h-[calc(100vh-250px)] min-h-[560px] grid-cols-1 md:grid-cols-3">
          <div className="flex min-h-0 flex-col gap-4 border-b border-border p-4 md:border-b-0 md:border-e">
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
          <div className="hidden min-h-0 flex-col bg-muted/40 p-4 md:col-span-2 md:flex">
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
