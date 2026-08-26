"use client";

import { useList } from "@refinedev/core";
import { Star, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner } from "@/components/kit/spinner";
import { asArray } from "@/lib/refine/as-array";

/**
 * The server's own ceiling on one page of reviews.
 *
 * `listReviews` ALWAYS paginates — `Math.min(100, …)` on `limit`, defaulting to
 * 20 — so there is no "fetch them all". Asking for the maximum is the most this
 * screen can see, and the copy below never claims to have seen more.
 */
const MAX_PAGE = 100;

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "size-4",
            star <= value
              ? "fill-warning text-warning"
              : "fill-transparent text-muted-foreground/40",
          )}
        />
      ))}
    </div>
  );
}

export function TeacherReviewsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();

  /* `limit`, not `pageSize`.
     This route reads `page` and `limit`; refine's pagination emits `page` and
     `pageSize`. So the old `pagination: { pageSize: 20 }` was never reaching
     the server at all — it simply fell through to the route's own default of
     20 and looked as though it had worked. Passing `limit` as a filter is how
     the rest of this portal reaches non-refine query parameters. */
  const { query, result } = useList({
    resource: "reviews",
    filters: [{ field: "limit", operator: "eq", value: String(MAX_PAGE) }],
    pagination: { mode: "off" },
  });

  const reviews = asArray<any>(result?.data);
  /** From `count()` on the server — the honest number of reviews that exist. */
  const total = (result?.total ?? reviews.length) as number;

  /* ── WHY THIS FIGURE IS NOT SIMPLY "THE AVERAGE" ─────────────────────────
     It used to be `sum(page one) / page one length`, printed under the label
     «متوسط التقييم» beside a separate «إجمالي التقييمات» taken from the
     server's real count. A teacher with sixty reviews therefore read an
     average of whichever twenty arrived first, labelled as their average — on
     the screen they are most likely to screenshot for marketing.

     The server cannot return more than 100, so for a teacher past that the
     screen genuinely cannot compute a true mean. It now says which it is
     showing instead of pretending: a complete average when the page covers
     every review, and an average OF THE LAST 100 when it does not. Never a
     sample wearing the name of the whole. */
  const complete = total <= reviews.length;
  const average =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : null;
  const fiveStar = reviews.filter((r) => r.rating === 5).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Card className="h-full">
          <CardContent className="px-3 py-3 text-center">
            <div className="text-xl font-bold text-warning">{average ?? "—"}</div>
            <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
              {complete
                ? t("teacher.averageRating")
                : t("teacher.averageRatingOfLast", { n: reviews.length })}
            </div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="px-3 py-3 text-center">
            <div className="text-xl font-bold text-foreground">{total}</div>
            <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
              {t("teacher.totalReviews")}
            </div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="px-3 py-3 text-center">
            <div className="text-xl font-bold text-success">{fiveStar}</div>
            <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
              {complete
                ? t("teacher.fiveStarReviews")
                : t("teacher.fiveStarOfLast", { n: reviews.length })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("teacher.reviews")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {query.isLoading ? (
            <PageSpinner />
          ) : reviews.length === 0 ? (
            <div className="px-6">
              <EmptyState icon={Star} title={t("teacher.noReviews")} />
            </div>
          ) : (
            /* Rows, not a four-column table. The COMMENT is the content here —
               it is what a teacher actually reads — and in a table cell at
               375px it had roughly a quarter of the width. */
            <ul className="divide-y divide-border border-y border-border">
              {reviews.map((r: any) => (
                <li key={r.id || r._id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <User className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium text-foreground">
                        {r.studentId?.name || t("teacher.anonymous")}
                      </span>
                    </span>
                    <StarRating value={r.rating} />
                  </div>
                  {r.text ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                      {r.text}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-sm italic text-muted-foreground">
                      {t("teacher.noComment")}
                    </p>
                  )}
                  {r.createdAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Said once, plainly, when the list is not the whole record — rather
          than silently showing 100 of 160 and letting the counts above imply
          otherwise. */}
      {!complete ? (
        <p className="text-xs text-muted-foreground">
          {t("teacher.reviewsTruncated", { shown: reviews.length, total })}
        </p>
      ) : null}
    </div>
  );
}
