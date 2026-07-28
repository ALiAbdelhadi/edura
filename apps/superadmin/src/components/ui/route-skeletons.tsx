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

/**
 * The generic fallback. One boundary covers every page in a back-office segment, so
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
