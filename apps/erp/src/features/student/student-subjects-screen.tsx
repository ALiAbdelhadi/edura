"use client";

import { useState } from "react";
import { useCustom, useList } from "@refinedev/core";
import { BookOpen, ChevronDown, Clock, MapPin, Archive, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { SearchInput } from "@repo/ui/components/search-input";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { cn } from "@repo/ui/lib/utils";
import {
  Hairline,
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  Num,
  PageTitle,
  Sheet,
} from "@/features/student/ledger";
import { CourseSubscribeActions } from "@/features/student/course-subscribe-actions";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { asArray } from "@/lib/refine/as-array";
import {
  DeliveryChip,
  DiscoveryFilterBar,
  EMPTY_DISCOVERY_FILTERS,
  discoveryQueryFilters,
  isFiltered,
  useDayNames,
  type DiscoveryFilters,
} from "@/features/student/discovery-filters";
import { stateBySubject, type SubscriptionRow } from "@/features/subscriptions/subscription-state";
import { SubscriptionStateChip } from "@/features/subscriptions/subscription-state-chip";

type CatalogSubject = { id: string; code: string; nameAr: string; nameEn: string };

type UpcomingSession = { id: string; date: string; startTime: string; endTime: string };

type CourseHit = {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  price: number;
  pricePerMonth: number | null;
  pricePerSession: number | null;
  location: string | null;
  maxStudents: number;
  activeEnrollmentCount: number;
  remainingSeats: number;
  teacherName: string | null;
  deliveryMode: "onsite" | "online" | "hybrid";
  teacherRatingAvg: number;
  center: { id: string; name: string; area: string | null } | null;
  upcomingSessions: UpcomingSession[];
};

const UNCATEGORIZED_ID = "none";

function SubjectCourses({
  subjectId,
  browseAll,
  filters,
}: {
  subjectId: string;
  browseAll: boolean;
  filters: DiscoveryFilters;
}) {
  const t = useTranslations();
  const { locale } = useFormatters();
  const courseStrings = useQueryStrings();
  const dayNames = useDayNames();
  const { query, result } = useList({
    resource: "search/courses",
    filters: [
      { field: "subjectId", operator: "eq", value: subjectId },
      ...(browseAll ? [{ field: "scope", operator: "eq" as const, value: "all" }] : []),
      ...discoveryQueryFilters(filters),
    ],
    pagination: { mode: "off" },
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-5 py-6 text-sm" style={{ color: "var(--ink-3)" }}>
        <Spinner /> {t("studentBrowse.loadingCourses")}
      </div>
    );
  }

  if (query.isError) {
    return (
      <LoadError
        className="m-4"
        message={courseStrings.loadFailed}
        onRetry={() => query.refetch()}
        retryLabel={courseStrings.retry}
      />
    );
  }

  const courses = (result?.data ?? []) as CourseHit[];

  if (courses.length === 0) {
    return (
      <div className="px-5 py-2">
        <LedgerEmpty
          title={
            isFiltered(filters)
              ? t("studentDiscovery.noCoursesForFilters")
              : t("studentSubjects.noCoursesForSubject")
          }
          hint={isFiltered(filters) ? t("studentDiscovery.noCoursesForFiltersHint") : undefined}
        />
      </div>
    );
  }

  return (
    <ul>
      {courses.map((course, index) => (
        <li key={course.id}>
          {index > 0 ? <Hairline /> : null}
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="font-medium" style={{ color: "var(--ink)" }}>
                {course.title}
              </div>
              {course.teacherName ? (
                <div className="text-sm" style={{ color: "var(--ink-2)" }}>
                  {t("roles.teacher")}: {course.teacherName}
                </div>
              ) : null}
              <div
                className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                style={{ color: "var(--ink-3)" }}
              >
                {course.daysOfWeek?.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" aria-hidden />
                    {dayNames.filter((_, i) => course.daysOfWeek.includes(i)).join("\u060C ")}{" "}
                    <Num.ClockRange start={course.startTime} end={course.endTime} locale={locale} />
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden />
                  {course.deliveryMode === "online"
                    ? t("studentDiscovery.onlineClass")
                    : (course.center?.name ?? t("studentSubjects.noCenter"))}
                </span>
                <DeliveryChip mode={course.deliveryMode} />
                {course.maxStudents > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3" aria-hidden />
                    {t("studentSubjects.seats")}{" "}
                    <Num>
                      {course.activeEnrollmentCount}/{course.maxStudents}
                    </Num>
                  </span>
                ) : null}
              </div>
            </div>

            <CourseSubscribeActions course={course} onChanged={() => query.refetch()} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StudentSubjectsScreen() {
  const t = useTranslations();
  const { locale } = useFormatters();
  const queryStrings = useQueryStrings();
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<DiscoveryFilters>(EMPTY_DISCOVERY_FILTERS);

  const browseAll = tab === "all";

  const { query, result } = useList({
    resource: "catalog/subjects",
    filters: [
      browseAll
        ? { field: "all", operator: "eq", value: "1" }
        : { field: "mine", operator: "eq", value: "1" },
    ],
    pagination: { mode: "off" },
  });

  const { result: subsResult } = useCustom({ url: "me/subscriptions", method: "get" });
  const subjectStates = stateBySubject(asArray<SubscriptionRow>(subsResult?.data));

  const subjects = (result?.data ?? []) as CatalogSubject[];
  const subjectName = (s: CatalogSubject) => (locale === "ar" ? s.nameAr : s.nameEn);

  const visibleSubjects = browseAll
    ? subjects.filter((s) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
          s.nameAr.toLowerCase().includes(q) ||
          s.nameEn.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q)
        );
      })
    : subjects;

  const switchTab = (next: string) => {
    setTab(next as "mine" | "all");
    setExpandedId(null);
    setSearch("");
  };

  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  const renderSubjectRow = (
    id: string,
    title: string,
    subtitle?: string,
    legacy?: boolean,
  ) => {
    const expanded = expandedId === id;
    const state = subjectStates.get(id);
    return (
      <Sheet key={id} className="overflow-hidden">
        <button
          type="button"
          onClick={() => toggle(id)}
          aria-expanded={expanded}
          aria-label={title}
          className="flex w-full items-center gap-3 px-5 py-4 text-start transition-colors hover:bg-[var(--field)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--indigo)]"
        >
          {legacy ? (
            <Archive className="size-5 shrink-0" style={{ color: "var(--ink-3)" }} aria-hidden />
          ) : (
            <InitialsTile name={title} size={34} tone="indigo" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-medium" style={{ color: "var(--ink)" }}>
              {title}
            </span>
            {subtitle ? (
              <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                {subtitle}
              </span>
            ) : null}
          </span>
          {state ? <SubscriptionStateChip state={state} /> : null}
          <ChevronDown
            aria-hidden
            className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")}
            style={{ color: "var(--ink-3)" }}
          />
        </button>
        {expanded ? (
          <div style={{ borderTop: "1px solid var(--rule)" }}>
            <SubjectCourses subjectId={id} browseAll={browseAll} filters={filters} />
          </div>
        ) : null}
      </Sheet>
    );
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title={t("nav.mySubjects")}
        subtitle={browseAll ? undefined : t("studentSubjects.myTabHint")}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={switchTab}>
          <TabsList>
            <TabsTrigger value="mine">{t("studentSubjects.myTab")}</TabsTrigger>
            <TabsTrigger value="all">{t("studentSubjects.allTab")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {browseAll ? (
          <SearchInput
            className="max-w-md flex-1"
            placeholder={t("studentSubjects.searchPlaceholder")}
            value={search}
            onValueChange={(v) => setSearch(v)}
            onClear={() => setSearch("")}
            clearLabel={t("studentSubjects.searchPlaceholder")}
          />
        ) : null}
      </div>

      <DiscoveryFilterBar value={filters} onChange={setFilters} />

      {query.isLoading ? <PageSpinner label={t("studentSubjects.loadingSubjects")} /> : null}

      {query.isError ? (
        <LoadError
          message={queryStrings.loadFailed}
          onRetry={() => query.refetch()}
          retryLabel={queryStrings.retry}
        />
      ) : null}

      {!query.isLoading && !query.isError && visibleSubjects.length === 0 ? (
        <Sheet className="p-5">
          <LedgerEmpty
            title={
              browseAll
                ? t("studentSubjects.noSubjectsFound")
                : t("studentSubjects.noTrackSubjects")
            }
            hint={browseAll ? undefined : t("studentSubjects.noTrackSubjectsHint")}
            action={
              browseAll ? null : (
                <LedgerButton onClick={() => switchTab("all")}>
                  <BookOpen className="size-4" aria-hidden />
                  {t("studentSubjects.allTab")}
                </LedgerButton>
              )
            }
          />
        </Sheet>
      ) : null}

      <div className="space-y-3">
        {visibleSubjects.map((s) =>
          renderSubjectRow(s.id, subjectName(s), locale === "ar" ? s.nameEn : s.nameAr),
        )}
        {browseAll && !query.isLoading
          ? renderSubjectRow(
              UNCATEGORIZED_ID,
              t("studentSubjects.uncategorized"),
              t("studentSubjects.uncategorizedHint"),
              true,
            )
          : null}
      </div>
    </div>
  );
}
