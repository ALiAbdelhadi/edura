"use client";

import { useState } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { BookOpen, ChevronDown, Clock, MapPin, Archive } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@repo/ui/components/card";
import { SearchInput } from "@repo/ui/components/search-input";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
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
import { cn } from "@repo/ui/lib/utils";

type CatalogSubject = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
};

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
  teacherRatingAvg: number;
  center: { id: string; name: string; area: string | null } | null;
  upcomingSessions: UpcomingSession[];
};

/** Sentinel understood by /api/v1/search/courses: subjectId=none ⇒ uncatalogued (subjectId IS NULL). */
const UNCATEGORIZED_ID = "none";

function SubjectCourses({ subjectId, browseAll }: { subjectId: string; browseAll: boolean }) {
  const t = useTranslations();
  const { formatEGP } = useFormatters();
  const { query, result } = useList({
    resource: "search/courses",
    filters: [
      { field: "subjectId", operator: "eq", value: subjectId },
      ...(browseAll ? [{ field: "scope", operator: "eq" as const, value: "all" }] : []),
    ],
    pagination: { mode: "off" },
  });

  const { mutateAsync: requestEnrollment } = useCustomMutation();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Per-course session choice for the per-session pass plan.
  const [sessionChoice, setSessionChoice] = useState<Record<string, string>>({});
  // Pending mock checkout: intent to confirm via the mock gateway.
  const [mockIntent, setMockIntent] = useState<{ intentId: string; amount: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Legacy flow for courses WITHOUT subscription plans configured.
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

  // Subscription checkout (Step 4): plan price is a server-side snapshot; the
  // client only names the plan. In mock mode the returned checkout URL points
  // at the local mock gateway, so we confirm via the mock-complete endpoint.
  const handleSubscribe = async (course: CourseHit, plan: "monthly" | "per_session") => {
    setLoadingId(course.id);
    try {
      const sessionId = plan === "per_session" ? sessionChoice[course.id] : undefined;
      if (plan === "per_session" && !sessionId) {
        toast.error(t("studentSubjects.pickSessionFirst"));
        return;
      }
      const res = await requestEnrollment({
        url: "subscriptions/checkout",
        method: "post",
        values: {
          courseId: course.id,
          plan,
          ...(sessionId ? { sessionId } : {}),
          method: "card",
          idempotencyKey: `sub-${course.id}-${plan}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        },
      });
      const intent = (res as any)?.data?.data ?? (res as any)?.data;
      if (intent?.checkout?.url?.includes("mock-checkout")) {
        setMockIntent({ intentId: intent.id, amount: intent.amount });
      } else if (intent?.checkout?.url) {
        window.open(intent.checkout.url, "_blank");
      }
    } catch (err: any) {
      toast.error(err?.message || t("studentSubjects.checkoutFailed"));
    } finally {
      setLoadingId(null);
    }
  };

  const completeMockPayment = async (outcome: "success" | "failure") => {
    if (!mockIntent) return;
    try {
      await requestEnrollment({
        url: `payments/intents/${mockIntent.intentId}/mock-complete`,
        method: "post",
        values: { outcome },
      });
      if (outcome === "success") {
        toast.success(t("studentSubjects.subscriptionActive"));
      } else {
        toast.error(t("studentSubjects.paymentDeclined"));
      }
    } catch (err: any) {
      toast.error(err?.message || t("studentSubjects.checkoutFailed"));
    } finally {
      setMockIntent(null);
      setRefreshKey((k) => k + 1);
    }
  };
  void refreshKey;

  const dayNames = [
    t("studentBrowse.sun"),
    t("studentBrowse.mon"),
    t("studentBrowse.tue"),
    t("studentBrowse.wed"),
    t("studentBrowse.thu"),
    t("studentBrowse.fri"),
    t("studentBrowse.sat"),
  ];

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
        <Spinner /> {t("studentBrowse.loadingCourses")}
      </div>
    );
  }

  const courses = (result?.data ?? []) as CourseHit[];

  if (courses.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        {t("studentSubjects.noCoursesForSubject")}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {courses.map((c) => (
        <li key={c.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="font-medium text-foreground">{c.title}</div>
            {c.teacherName && (
              <div className="text-sm text-muted-foreground">
                {t("roles.teacher")}: {c.teacherName}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {c.daysOfWeek?.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {dayNames.filter((_, i) => c.daysOfWeek.includes(i)).join(", ")}{" "}
                  <span dir="ltr">
                    {c.startTime}–{c.endTime}
                  </span>
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {c.center?.name ?? t("studentSubjects.noCenter")}
              </span>
              {c.maxStudents > 0 && (
                <span dir="ltr">
                  {c.activeEnrollmentCount}/{c.maxStudents}
                </span>
              )}
            </div>
          </div>
          {c.pricePerMonth || c.pricePerSession ? (
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              {c.pricePerMonth ? (
                <Button
                  size="sm"
                  disabled={loadingId === c.id}
                  onClick={() => handleSubscribe(c, "monthly")}
                >
                  {loadingId === c.id ? <Spinner /> : null}
                  {t("studentSubjects.subscribeMonthly")} · {formatEGP(c.pricePerMonth)}
                </Button>
              ) : null}
              {c.pricePerSession ? (
                <div className="flex items-center gap-2">
                  <Select
                    value={sessionChoice[c.id] || undefined}
                    onValueChange={(v) =>
                      setSessionChoice((m) => ({ ...m, [c.id]: v }))
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="text-xs"
                      aria-label={t("studentSubjects.pickSession")}
                    >
                      <SelectValue placeholder={t("studentSubjects.pickSession")} />
                    </SelectTrigger>
                    <SelectContent>
                      {c.upcomingSessions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {new Date(s.date).toLocaleDateString()} {s.startTime}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingId === c.id}
                    onClick={() => handleSubscribe(c, "per_session")}
                  >
                    {t("studentSubjects.bookSession")} · {formatEGP(c.pricePerSession)}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-3">
              <div className="text-sm font-semibold text-foreground">{formatEGP(c.price ?? 0)}</div>
              <Button
                size="sm"
                disabled={loadingId === c.id}
                onClick={() => handleRequest(c.id)}
              >
                {loadingId === c.id ? <Spinner /> : null}
                {t("studentBrowse.requestEnrollment")}
              </Button>
            </div>
          )}
        </li>
      ))}

      {mockIntent ? (
        <li className="border-t border-dashed border-border bg-muted/30 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium">{t("studentSubjects.mockCheckoutTitle")}</span>{" "}
              <span className="text-muted-foreground">
                {formatEGP(mockIntent.amount)} — {t("studentSubjects.mockCheckoutHint")}
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => completeMockPayment("success")}>
                {t("studentSubjects.mockPay")}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => completeMockPayment("failure")}>
                {t("studentSubjects.mockFail")}
              </Button>
            </div>
          </div>
        </li>
      ) : null}
    </ul>
  );
}

export function StudentSubjectsScreen() {
  const t = useTranslations();
  const { locale } = useFormatters();
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    return (
      <Card key={id} className="overflow-hidden py-0">
        <button
          type="button"
          onClick={() => toggle(id)}
          aria-expanded={expanded}
          className="flex w-full items-center gap-3 px-4 py-4 text-start hover:bg-muted/50"
        >
          {legacy ? (
            <Archive className="size-5 shrink-0 text-muted-foreground" />
          ) : (
            <BookOpen className="size-5 shrink-0 text-info" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-foreground">{title}</span>
            {subtitle ? (
              <span className="block text-xs text-muted-foreground">{subtitle}</span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        {expanded && (
          <div className="border-t border-border bg-muted/20">
            <SubjectCourses subjectId={id} browseAll={browseAll} />
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.subjects")} />

      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="mine">{t("studentSubjects.myTab")}</TabsTrigger>
          <TabsTrigger value="all">{t("studentSubjects.allTab")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {browseAll && (
        <SearchInput
            className="max-w-md"
            placeholder={t("studentSubjects.searchPlaceholder")}
            value={search}
            onValueChange={(v) => setSearch(v)}
            onClear={() => setSearch("")}
            clearLabel={t("studentSubjects.searchPlaceholder")}
          />
      )}

      {!browseAll && (
        <p className="text-sm text-muted-foreground">{t("studentSubjects.myTabHint")}</p>
      )}

      {query.isLoading && <PageSpinner label={t("studentSubjects.loadingSubjects")} />}

      {!query.isLoading && visibleSubjects.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title={
            browseAll
              ? t("studentSubjects.noSubjectsFound")
              : t("studentSubjects.noTrackSubjects")
          }
        />
      )}

      <div className="space-y-3">
        {visibleSubjects.map((s) =>
          renderSubjectRow(
            s.id,
            subjectName(s),
            locale === "ar" ? s.nameEn : s.nameAr,
          ),
        )}
        {browseAll &&
          !query.isLoading &&
          renderSubjectRow(
            UNCATEGORIZED_ID,
            t("studentSubjects.uncategorized"),
            t("studentSubjects.uncategorizedHint"),
            true,
          )}
      </div>
    </div>
  );
}
