"use client";

import { DescriptionList } from "@/components/kit/description-list";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { StatCard } from "@/components/kit/stat-card";
import { StatusBadge } from "@/components/kit/status-badge";
import { Link, useRouter } from "@/i18n/navigation";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { toast } from "@repo/ui/components/sonner";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Calendar,
  Clock,
  DollarSign,
  Star,
  User,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";
function formatSchedule(
  pattern: any,
  formatWeekdayShort: (dayIndex: number) => string,
  tbd: string,
): string {
  if (!pattern?.daysOfWeek?.length) return tbd;
  const days = pattern.daysOfWeek.map((d: number) => formatWeekdayShort(d)).join(", ");
  return `${days} ${pattern.startTime ?? ""}–${pattern.endTime ?? ""}`.trim();
}

export default function CourseDetailPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const t = useTranslations();
  const { formatWeekdayShort } = useFormatters();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const courseId = rawId ? decodeURIComponent(rawId) : "";

  const { query, result } = useCustom({
    url: courseId ? `courses/${courseId}` : "",
    method: "get",
    queryOptions: { enabled: !!courseId },
  });

  const { mutateAsync: requestEnrollment } = useCustomMutation();
  const [loading, setLoading] = useState(false);

  const course = result?.data as any;

  const handleEnroll = async () => {
    setLoading(true);
    try {
      await requestEnrollment({
        url: "enrollment-requests",
        method: "post",
        values: { courseId },
      });
      toast.success(t("publicCourse.enrollSuccess"));
    } catch (err: any) {
      toast.error(err?.message || t("publicCourse.enrollFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <PageSpinner />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Button variant="outline" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="size-4 rtl:-scale-x-100" />
          {t("common.back")}
        </Button>
        <Card>
          <CardContent>
            <p className="text-center text-muted-foreground">{t("publicCourse.notFound")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const remaining = course.remainingSeats ?? (course.maxStudents - (course.enrolledCount ?? 0));
  const isFull = remaining <= 0;
  const seatColor = isFull
    ? "text-destructive"
    : remaining <= 3
      ? "text-warning"
      : "text-success";

  const detailItems: { label: React.ReactNode; value: React.ReactNode }[] = [
    {
      label: (
        <span className="inline-flex items-center gap-1">
          <User className="size-3.5" /> {t("roles.teacher")}
        </span>
      ),
      value: (
        <span className="inline-flex items-center gap-2">
          {course.teacherName || t("common.tbd")}
          {course.teacherRating > 0 && (
            <span dir="ltr" className="inline-flex items-center gap-1 text-xs text-warning">
              <Star className="size-3.5" /> {course.teacherRating} ({course.teacherReviewCount})
            </span>
          )}
        </span>
      ),
    },
    ...(course.centerName
      ? [
          {
            label: (
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3.5" /> {t("common.center")}
              </span>
            ),
            value: (
              <Link href={`/centers/${course.centerId}`} className="text-primary hover:underline">
                {course.centerName}
              </Link>
            ),
          },
        ]
      : []),
    {
      label: (
        <span className="inline-flex items-center gap-1">
          <Calendar className="size-3.5" /> {t("nav.schedule")}
        </span>
      ),
      value: formatSchedule(course.schedulePattern, formatWeekdayShort, t("common.tbd")),
    },
    {
      label: (
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" /> {t("publicCourse.duration")}
        </span>
      ),
      value: (
        <span dir="ltr">
          {course.schedulePattern?.startDate
            ? `${new Date(course.schedulePattern.startDate).toLocaleDateString("en", { month: "short", day: "numeric" })} – ${new Date(course.schedulePattern.endDate).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`
            : t("common.tbd")}
        </span>
      ),
    },
    {
      label: (
        <span className="inline-flex items-center gap-1">
          <DollarSign className="size-3.5" /> {t("common.price")}
        </span>
      ),
      value: <span dir="ltr">EGP {((course.price ?? 0) / 100).toLocaleString()}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Button variant="outline" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="size-4 rtl:-scale-x-100" />
        {t("common.back")}
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-xl">
            <BookOpen className="size-5 text-primary" />
            {course.title}
          </CardTitle>
          <Button size="lg" disabled={isFull || loading} onClick={handleEnroll}>
            {loading ? <Spinner /> : null}
            {isFull ? t("publicCourse.classFull") : t("publicCourse.requestEnrollment")}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-6 md:col-span-2">
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="info">{course.subject}</StatusBadge>
                {course.gradeTag && <StatusBadge tone="neutral">{course.gradeTag}</StatusBadge>}
              </div>
              {course.description && (
                <p className="leading-relaxed text-muted-foreground">{course.description}</p>
              )}
              <DescriptionList columns={2} items={detailItems} />
            </div>
            <div className="space-y-4">
              <StatCard
                label={t("publicCourse.remainingSeats")}
                value={<span className={seatColor}>{remaining}</span>}
                unit={`/ ${course.maxStudents}`}
                icon={Users}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
