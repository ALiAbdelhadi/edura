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

  const { query, result } = useList({
    resource: "reviews",
    filters: [{ field: "limit", operator: "eq", value: String(MAX_PAGE) }],
    pagination: { mode: "off" },
  });

  const reviews = asArray<any>(result?.data);
  const total = (result?.total ?? reviews.length) as number;

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

      {!complete ? (
        <p className="text-xs text-muted-foreground">
          {t("teacher.reviewsTruncated", { shown: reviews.length, total })}
        </p>
      ) : null}
    </div>
  );
}
