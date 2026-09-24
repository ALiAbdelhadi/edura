"use client";

import { useState } from "react";
import { useList } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Clock, MapPin, Star, Users } from "lucide-react";
import { SearchInput } from "@repo/ui/components/search-input";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import {
  Chip,
  Hairline,
  InitialsTile,
  LedgerEmpty,
  Num,
  PageTitle,
  Sheet,
} from "@/features/student/ledger";
import { CourseSubscribeActions } from "@/features/student/course-subscribe-actions";
import {
  DeliveryChip,
  DiscoveryFilterBar,
  EMPTY_DISCOVERY_FILTERS,
  discoveryQueryFilters,
  useDayNames,
  type DiscoveryFilters,
} from "@/features/student/discovery-filters";
import { PageSpinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { QUERY_FRESHNESS } from "@/lib/refine";

type CatalogSubject = { id: string; code: string; nameAr: string; nameEn: string };

type TeacherCourse = {
  id: string;
  title: string;
  subject: string;
  gradeTag: string | null;
  daysOfWeek: number[];
  matchedDays: number[];
  startTime: string;
  endTime: string;
  price: number | null;
  pricePerMonth: number | null;
  pricePerSession: number | null;
  location: string | null;
  deliveryMode: "onsite" | "online" | "hybrid";
  maxStudents: number;
  activeEnrollmentCount: number;
  remainingSeats: number;
  center: { id: string; name: string; area: string | null; logoUrl: string | null } | null;
  upcomingSessions: { id: string; date: string; startTime: string; endTime: string }[];
};

type TeacherHit = {
  userId: string;
  name: string;
  photoUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  experienceYears: number | null;
  courseCount: number;
  courses: TeacherCourse[];
};

const ALL_SUBJECTS = "all";

export function FindTeacherScreen() {
  const t = useTranslations();
  const { locale } = useFormatters();
  const strings = useQueryStrings();
  const dayNames = useDayNames();

  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [subjectId, setSubjectId] = useState<string>(ALL_SUBJECTS);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [filters, setFilters] = useState<DiscoveryFilters>(EMPTY_DISCOVERY_FILTERS);

  const browseAll = scope === "all";

  const { result: subjectsResult } = useList({
    resource: "catalog/subjects",
    filters: [
      browseAll
        ? { field: "all", operator: "eq", value: "1" }
        : { field: "mine", operator: "eq", value: "1" },
    ],
    pagination: { mode: "off" },
    queryOptions: QUERY_FRESHNESS.reference,
  });
  const subjects = (subjectsResult?.data ?? []) as CatalogSubject[];
  const subjectName = (s: CatalogSubject) => (locale === "ar" ? s.nameAr : s.nameEn);

  const { query, result } = useList({
    resource: "search/teacher-days",
    filters: [
      ...(browseAll ? [{ field: "scope", operator: "eq" as const, value: "all" }] : []),
      ...(subjectId !== ALL_SUBJECTS
        ? [{ field: "subjectId", operator: "eq" as const, value: subjectId }]
        : []),
      ...(teacherSearch.trim()
        ? [{ field: "q", operator: "eq" as const, value: teacherSearch.trim() }]
        : []),
      ...discoveryQueryFilters(filters),
    ],
    pagination: { mode: "off" },
    queryOptions: QUERY_FRESHNESS.discovery,
  });

  const teachers = (result?.data ?? []) as TeacherHit[];

  const switchScope = (next: string) => {
    setScope(next as "mine" | "all");
    setSubjectId(ALL_SUBJECTS);
  };

  const dayLabel = (course: TeacherCourse) => {
    const days = course.matchedDays.length > 0 ? course.matchedDays : course.daysOfWeek;
    return dayNames.filter((_, i) => days.includes(i)).join("، ");
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title={t("studentDiscovery.findTeacherTitle")}
        subtitle={t("studentDiscovery.findTeacherSubtitle")}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={scope} onValueChange={switchScope}>
          <TabsList>
            <TabsTrigger value="mine">{t("studentSubjects.myTab")}</TabsTrigger>
            <TabsTrigger value="all">{t("studentSubjects.allTab")}</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={subjectId} onValueChange={setSubjectId}>
          <SelectTrigger className="min-w-52" aria-label={t("studentBrowse.subject")}>
            <SelectValue placeholder={t("studentDiscovery.anySubject")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SUBJECTS}>{t("studentDiscovery.anySubject")}</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {subjectName(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SearchInput
          className="max-w-xs flex-1"
          placeholder={t("studentDiscovery.teacherSearchPlaceholder")}
          value={teacherSearch}
          onValueChange={setTeacherSearch}
          onClear={() => setTeacherSearch("")}
          clearLabel={t("studentDiscovery.teacherSearchPlaceholder")}
        />
      </div>

      <DiscoveryFilterBar value={filters} onChange={setFilters} />

      {query.isLoading ? <PageSpinner label={t("studentDiscovery.loadingTeachers")} /> : null}

      {query.isError ? (
        <LoadError
          message={strings.loadFailed}
          onRetry={() => query.refetch()}
          retryLabel={strings.retry}
        />
      ) : null}

      {!query.isLoading && !query.isError && teachers.length === 0 ? (
        <Sheet className="p-5">
          <LedgerEmpty
            title={t("studentDiscovery.noTeachers")}
            hint={t("studentDiscovery.noTeachersHint")}
          />
        </Sheet>
      ) : null}

      <div className="space-y-3">
        {teachers.map((teacher) => (
          <Sheet key={teacher.userId} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              {teacher.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={teacher.photoUrl}
                  alt=""
                  width={38}
                  height={38}
                  className="size-[38px] shrink-0 rounded-full object-cover"
                />
              ) : (
                <InitialsTile name={teacher.name} size={38} tone="indigo" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium" style={{ color: "var(--ink)" }}>
                  {teacher.name}
                </div>
                <div className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {t("studentDiscovery.groupsOnDay", { count: teacher.courseCount })}
                </div>
              </div>
              {teacher.ratingCount > 0 ? (
                <Chip tone="amber">
                  <Star className="size-3" aria-hidden />{" "}
                  <Num>{teacher.ratingAvg.toFixed(1)}</Num>{" "}
                  <span>({teacher.ratingCount})</span>
                </Chip>
              ) : null}
            </div>

            <div style={{ borderTop: "1px solid var(--rule)" }}>
              <ul>
                {teacher.courses.map((course, index) => (
                  <li key={course.id}>
                    {index > 0 ? <Hairline /> : null}
                    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="font-medium" style={{ color: "var(--ink)" }}>
                          {course.title}
                        </div>
                        <div
                          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                          style={{ color: "var(--ink-3)" }}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" aria-hidden />
                            {dayLabel(course)}{" "}
                            <Num.ClockRange
                              start={course.startTime}
                              end={course.endTime}
                              locale={locale}
                            />
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" aria-hidden />
                            {course.deliveryMode === "online"
                              ? t("studentDiscovery.onlineClass")
                              : (course.center?.name ??
                                course.location ??
                                t("studentSubjects.noCenter"))}
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

                      <CourseSubscribeActions
                        course={course}
                        onChanged={() => query.refetch()}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Sheet>
        ))}
      </div>
    </div>
  );
}
