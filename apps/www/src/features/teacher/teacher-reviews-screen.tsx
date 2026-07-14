"use client";

import { useList } from "@refinedev/core";
import { Star, User, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatCard } from "@/components/kit/stat-card";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner } from "@/components/kit/spinner";

/** Read-only row of 1–5 lucide stars (replaces AntD `Rate disabled`). */
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
    pagination: { pageSize: 20, currentPage: 1 },
  });

  const reviews = (result?.data ?? []) as any[];
  const total = result?.total ?? 0;

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : "0.0";

  const columns: ColumnDef<any>[] = [
    {
      id: "student",
      header: t("teacher.student"),
      cell: ({ row }) => {
        const student = row.original.studentId;
        return (
          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            <span>{student?.name || t("teacher.anonymous")}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "rating",
      header: t("teacher.rating"),
      cell: ({ row }) => <StarRating value={row.original.rating} />,
    },
    {
      accessorKey: "text",
      header: t("teacher.comment"),
      cell: ({ row }) =>
        row.original.text || (
          <span className="italic text-muted-foreground">
            {t("teacher.noComment")}
          </span>
        ),
    },
    {
      accessorKey: "createdAt",
      header: t("teacher.date"),
      cell: ({ row }) =>
        row.original.createdAt ? formatDate(row.original.createdAt) : "—",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={t("teacher.averageRating")}
          value={<span className="text-warning">{avgRating}</span>}
          unit="/ 5"
          icon={Star}
          accent
        />
        <StatCard
          label={t("teacher.totalReviews")}
          value={total}
          icon={MessageSquare}
        />
        <StatCard
          label={t("teacher.fiveStarReviews")}
          value={
            <span className="text-success">
              {reviews.filter((r) => r.rating === 5).length}
            </span>
          }
          icon={Star}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("teacher.reviews")}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={columns}
              data={reviews}
              pageSize={10}
              emptyState={
                <EmptyState icon={Star} title={t("teacher.noReviews")} />
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
