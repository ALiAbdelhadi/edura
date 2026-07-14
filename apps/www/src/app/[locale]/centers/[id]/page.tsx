"use client";

import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCustom } from "@refinedev/core";
import {
  ArrowLeft,
  Building2,
  BookOpen,
  Users,
  Star,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { cn } from "@repo/ui/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatCard } from "@/components/kit/stat-card";
import { StatusBadge } from "@/components/kit/status-badge";
import { DescriptionList } from "@/components/kit/description-list";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner } from "@/components/kit/spinner";

function formatSchedule(
  pattern: any,
  formatWeekdayShort: (dayIndex: number) => string,
  tbd: string,
): string {
  if (!pattern?.daysOfWeek?.length) return tbd;
  const days = pattern.daysOfWeek.map((d: number) => formatWeekdayShort(d)).join(", ");
  return `${days} ${pattern.startTime ?? ""}–${pattern.endTime ?? ""}`.trim();
}

export default function CenterDetailPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const t = useTranslations();
  const { formatWeekdayShort } = useFormatters();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const centerId = rawId ? decodeURIComponent(rawId) : "";

  const { query, result } = useCustom({
    url: centerId ? `centers/${centerId}` : "",
    method: "get",
    queryOptions: { enabled: !!centerId },
  });

  const center = result?.data as any;

  if (query.isLoading) {
    return <PageSpinner />;
  }

  if (!center) {
    return (
      <div className="mx-auto max-w-[900px] p-6">
        <Button variant="outline" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="size-4 rtl:-scale-x-100" />
          {t("common.back")}
        </Button>
        <EmptyState icon={Building2} title={t("publicCenter.notFound")} />
      </div>
    );
  }

  const courseColumns: ColumnDef<any>[] = [
    {
      id: "title",
      header: t("publicCenter.colCourse"),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col">
            <Link
              href={`/courses/${r.id}`}
              className="font-semibold text-primary hover:underline"
            >
              {r.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              {r.subject}
              {r.gradeTag ? ` · ${r.gradeTag}` : ""}
            </span>
          </div>
        );
      },
    },
    {
      id: "teacherName",
      header: t("roles.teacher"),
      cell: ({ row }) => row.original.teacherName || t("common.tbd"),
    },
    {
      id: "schedule",
      header: t("nav.schedule"),
      cell: ({ row }) =>
        formatSchedule(row.original.schedulePattern, formatWeekdayShort, t("common.tbd")),
    },
    {
      id: "price",
      header: t("common.price"),
      cell: ({ row }) => `EGP ${((row.original.price ?? 0) / 100).toLocaleString()}`,
    },
    {
      id: "seats",
      header: t("publicCenter.colSeats"),
      cell: ({ row }) => {
        const r = row.original;
        const remaining = r.maxStudents - (r.enrolledCount ?? 0);
        return (
          <span
            className={cn(
              "tabular-nums",
              remaining <= 0
                ? "text-destructive"
                : remaining <= 3
                  ? "text-warning"
                  : "text-success",
            )}
          >
            {r.enrolledCount ?? 0}/{r.maxStudents}
          </span>
        );
      },
    },
    {
      id: "action",
      header: "",
      cell: ({ row }) => (
        <Button asChild variant="link" size="sm">
          <Link href={`/courses/${row.original.id}`}>{t("common.view")}</Link>
        </Button>
      ),
    },
  ];

  const detailItems = [
    center.address && {
      label: (
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" /> {t("common.address")}
        </span>
      ),
      value: center.address,
    },
    center.phone && {
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Phone className="size-3.5" /> {t("common.phone")}
        </span>
      ),
      value: center.phone,
    },
    center.email && {
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Mail className="size-3.5" /> {t("auth.email")}
        </span>
      ),
      value: center.email,
    },
  ].filter(Boolean) as { label: ReactNode; value: ReactNode }[];

  return (
    <div className="mx-auto max-w-[900px] p-6">
      <Button variant="outline" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="size-4 rtl:-scale-x-100" />
        {t("common.back")}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Building2 className="size-5 text-primary" />
            <span>{center.name}</span>
            {center.shortId && <StatusBadge tone="neutral">{center.shortId}</StatusBadge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex flex-col gap-6 md:col-span-2">
              {center.description && (
                <p className="leading-relaxed text-muted-foreground">
                  {center.description}
                </p>
              )}

              {center.subjects?.length > 0 && (
                <div>
                  <div className="mb-2 font-semibold text-foreground">
                    {t("publicCenter.subjects")}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {center.subjects.map((s: string) => (
                      <StatusBadge key={s} tone="info">
                        {s}
                      </StatusBadge>
                    ))}
                  </div>
                </div>
              )}

              {detailItems.length > 0 && (
                <DescriptionList columns={2} items={detailItems} />
              )}
            </div>

            <div className="flex flex-col gap-4 md:col-span-1">
              <StatCard
                label={t("publicCenter.rating")}
                value={center.rating || "—"}
                unit={center.rating ? "/ 5" : undefined}
                hint={t("publicCenter.reviews", { count: center.reviewCount ?? 0 })}
                icon={Star}
              />
              <StatCard
                label={t("nav.courses")}
                value={center.totalCourses}
                icon={BookOpen}
              />
              <StatCard
                label={t("nav.students")}
                value={center.totalStudents}
                icon={Users}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("publicCenter.availableCourses")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={courseColumns}
            data={center.courses ?? []}
            pageSize={9999}
            emptyState={t("publicCenter.noCourses")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
