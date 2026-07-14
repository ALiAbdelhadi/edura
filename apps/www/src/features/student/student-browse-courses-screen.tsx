"use client";

import { useState } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { Search, BookOpen, Filter, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import { Slider } from "@repo/ui/components/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import { StatusBadge } from "@/components/kit/status-badge";
import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";

const ALL_SUBJECTS = "__all__";

export function StudentBrowseCoursesScreen() {
  const t = useTranslations();
  const { formatEGP } = useFormatters();
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [showFilters, setShowFilters] = useState(false);

  const { query, result } = useList({
    resource: "search/courses",
    filters: [
      ...(search ? [{ field: "q", operator: "eq" as const, value: search }] : []),
      ...(subject ? [{ field: "subject", operator: "eq" as const, value: subject }] : []),
    ],
    pagination: { mode: "off" },
  });

  const { mutateAsync: requestEnrollment } = useCustomMutation();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const allCourses = (result?.data ?? []) as any[];

  const courses = allCourses.filter((c) => {
    const priceEGP = (c.price ?? 0) / 100;
    return priceEGP >= priceRange[0] && priceEGP <= priceRange[1];
  });

  const subjects = [...new Set(allCourses.map((c) => c.subject).filter(Boolean))].sort();

  const handleRequest = async (courseId: string) => {
    setLoadingId(courseId);
    try {
      await requestEnrollment({
        url: "enrollment-requests",
        method: "post",
        values: { courseId },
      });
      toast.success(t("studentBrowse.enrollmentSent"));
    } catch (err: any) {
      toast.error(err?.message || t("studentBrowse.enrollmentFailed"));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.browse")} />

      <Card>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("studentBrowse.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 ps-9 pe-9"
            />
            {search && (
              <button
                type="button"
                aria-label={t("studentBrowse.searchPlaceholder")}
                onClick={() => setSearch("")}
                className="absolute inset-inline-end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="size-4" />
              {showFilters ? t("studentBrowse.hideFilters") : t("studentBrowse.moreFilters")}
            </Button>
          </div>
          {showFilters && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[13px] text-muted-foreground">{t("studentBrowse.subject")}</div>
                <Select
                  value={subject ?? undefined}
                  onValueChange={(v) => setSubject(v === ALL_SUBJECTS ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("studentBrowse.allSubjects")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SUBJECTS}>{t("studentBrowse.allSubjects")}</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-1 text-[13px] text-muted-foreground">
                  {t("studentBrowse.priceRange")}:{" "}
                  <span dir="ltr">
                    {priceRange[0]} – {priceRange[1] >= 10000 ? "10,000+" : priceRange[1]}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={10000}
                  step={100}
                  value={priceRange}
                  onValueChange={(v) => setPriceRange(v as [number, number])}
                  className="mt-3"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {query.isLoading && <PageSpinner label={t("studentBrowse.loadingCourses")} />}

      {!query.isLoading && courses.length === 0 && (
        <EmptyState icon={BookOpen} title={t("studentBrowse.noCourses")} />
      )}

      {courses.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Card key={c._id || c.id} className="flex h-full flex-col">
              <CardHeader>
                <CardTitle>
                  <Link
                    href={`/courses/${c._id || c.id}`}
                    className="flex items-center gap-2 text-inherit hover:underline"
                  >
                    <BookOpen className="size-4 text-info" />
                    <span>{c.title}</span>
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                <p className="line-clamp-2 min-h-11 text-muted-foreground">
                  {c.description || t("studentBrowse.noDescription")}
                </p>
                <div className="space-y-2">
                  <StatusBadge tone="info">{c.subject}</StatusBadge>
                  {c.teacherName && (
                    <div className="text-sm">
                      <strong>{t("roles.teacher")}:</strong> {c.teacherName}
                    </div>
                  )}
                  {c.schedulePattern?.daysOfWeek && (
                    <div className="text-xs text-muted-foreground">
                      {[
                        t("studentBrowse.sun"),
                        t("studentBrowse.mon"),
                        t("studentBrowse.tue"),
                        t("studentBrowse.wed"),
                        t("studentBrowse.thu"),
                        t("studentBrowse.fri"),
                        t("studentBrowse.sat"),
                      ]
                        .filter((_, i) => c.schedulePattern.daysOfWeek?.includes(i))
                        .join(", ")}{" "}
                      <span dir="ltr">
                        {c.schedulePattern.startTime}–{c.schedulePattern.endTime}
                      </span>
                    </div>
                  )}
                  <div className="text-sm">
                    <strong>{t("studentBrowse.price")}:</strong> {formatEGP(c.price ?? 0)}
                  </div>
                  {c.maxStudents && (
                    <div className="text-xs text-muted-foreground">
                      <span dir="ltr">
                        {c.enrolledCount ?? 0}/{c.maxStudents}
                      </span>{" "}
                      {t("studentBrowse.seatsFilled")}
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  disabled={loadingId === (c._id || c.id)}
                  onClick={() => handleRequest(c._id || c.id)}
                >
                  {loadingId === (c._id || c.id) ? <Spinner /> : null}
                  {t("studentBrowse.requestEnrollment")}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
