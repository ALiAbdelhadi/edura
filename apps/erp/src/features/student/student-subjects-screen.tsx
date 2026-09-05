"use client";

import { useState } from "react";
import { useOnlineCheckout } from "@/lib/payments/use-online-checkout";
import { useCustom, useList, useCustomMutation } from "@refinedev/core";
import { BookOpen, ChevronDown, Clock, MapPin, Archive, Users, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import {
  Chip,
  Hairline,
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  Num,
  PageTitle,
  Sheet,
} from "@/features/student/ledger";
import { newIdempotencyKey } from "@/features/student/idempotency";
import { goToCheckout } from "@/lib/payments/checkout-redirect";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { asArray } from "@/lib/refine/as-array";
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
  teacherRatingAvg: number;
  center: { id: string; name: string; area: string | null } | null;
  upcomingSessions: UpcomingSession[];
};

const UNCATEGORIZED_ID = "none";

function SubjectCourses({ subjectId, browseAll }: { subjectId: string; browseAll: boolean }) {
  const t = useTranslations();
  const { formatEGP, formatDate, formatClock, locale } = useFormatters();
  const courseStrings = useQueryStrings();
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
  const [sessionChoice, setSessionChoice] = useState<Record<string, string>>({});
  const [mockIntent, setMockIntent] = useState<{ intentId: string; amount: number } | null>(null);
  const [mockBusy, setMockBusy] = useState(false);

  // Deliberately NOT gated on useOnlineCheckout: wallet money is already on the
  // platform, so spending it needs no gateway. Mirrors parent-pay-screen, where
  // the card button is gated and the wallet button is not.
  const { query: walletQuery, result: walletRes } = useCustom({
    url: "me/wallet",
    method: "get",
  });
  const walletBalance =
    typeof (walletRes?.data as { balance?: number } | undefined)?.balance === "number"
      ? (walletRes!.data as { balance: number }).balance
      : null;
  const canOfferWallet = walletBalance !== null && walletBalance > 0;
  const affords = (price: number | null) =>
    walletBalance !== null && price !== null && walletBalance >= price;

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

  const onlineCheckout = useOnlineCheckout();

  const handleSubscribe = async (
    course: CourseHit,
    plan: "monthly" | "per_session",
    payFrom: "gateway" | "wallet" = "gateway",
  ) => {
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
          payFrom,
          idempotencyKey: newIdempotencyKey(`sub-${course.id}-${plan}-${payFrom}`),
        },
      });
      // The wallet branch settles server-side and returns no checkout to follow.
      if (payFrom === "wallet") {
        toast.success(t("studentSubjects.paidFromBalance"));
        query.refetch();
        walletQuery.refetch();
        return;
      }
      const intent = (res as any)?.data?.data ?? (res as any)?.data;
      if (intent?.checkout?.url?.includes("mock-checkout")) {
        setMockIntent({ intentId: intent.id, amount: intent.amount });
      } else if (intent?.checkout?.url) {
        goToCheckout(intent.checkout.url);
      }
    } catch (err: any) {
      toast.error(err?.message || t("studentSubjects.checkoutFailed"));
    } finally {
      setLoadingId(null);
    }
  };

  const completeMockPayment = async (outcome: "success" | "failure") => {
    if (!mockIntent || mockBusy) return;
    setMockBusy(true);
    try {
      await requestEnrollment({
        url: `payments/intents/${mockIntent.intentId}/mock-complete`,
        method: "post",
        values: { outcome },
      });
      if (outcome === "success") toast.success(t("studentSubjects.subscriptionActive"));
      else toast.error(t("studentSubjects.paymentDeclined"));
    } catch (err: any) {
      toast.error(err?.message || t("studentSubjects.checkoutFailed"));
    } finally {
      setMockBusy(false);
      setMockIntent(null);
      query.refetch();
    }
  };

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
        <LedgerEmpty title={t("studentSubjects.noCoursesForSubject")} />
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
                    {dayNames.filter((_, i) => course.daysOfWeek.includes(i)).join("، ")}{" "}
                    <Num.ClockRange
                      start={course.startTime}
                      end={course.endTime}
                      locale={locale}
                    />
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden />
                  {course.center?.name ?? t("studentSubjects.noCenter")}
                </span>
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

            {course.pricePerMonth || course.pricePerSession ? (
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                {course.pricePerMonth ? (
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {onlineCheckout ? (
                      <LedgerButton
                        variant="primary"
                        disabled={loadingId === course.id}
                        onClick={() => handleSubscribe(course, "monthly")}
                      >
                        {loadingId === course.id ? <Spinner /> : null}
                        {t("studentSubjects.subscribeMonthly")}
                        <Num>{formatEGP(course.pricePerMonth)}</Num>
                      </LedgerButton>
                    ) : null}
                    {canOfferWallet ? (
                      <LedgerButton
                        variant={onlineCheckout ? undefined : "primary"}
                        disabled={loadingId === course.id || !affords(course.pricePerMonth)}
                        onClick={() => handleSubscribe(course, "monthly", "wallet")}
                      >
                        <Wallet className="size-4" aria-hidden />
                        {t("studentSubjects.payFromBalance")}
                        <Num>{formatEGP(course.pricePerMonth)}</Num>
                      </LedgerButton>
                    ) : null}
                  </div>
                ) : null}
                {course.pricePerSession ? (
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Select
                      value={sessionChoice[course.id] || undefined}
                      onValueChange={(v) =>
                        setSessionChoice((m) => ({ ...m, [course.id]: v }))
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
                        {course.upcomingSessions.map((session) => (
                          <SelectItem key={session.id} value={session.id}>
                            {formatDate(session.date, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}{" "}
                            · {formatClock(session.startTime)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {onlineCheckout ? (
                      <LedgerButton
                        disabled={loadingId === course.id}
                        onClick={() => handleSubscribe(course, "per_session")}
                      >
                        {t("studentSubjects.bookSession")}
                        <Num>{formatEGP(course.pricePerSession)}</Num>
                      </LedgerButton>
                    ) : null}
                    {canOfferWallet ? (
                      <LedgerButton
                        variant={onlineCheckout ? undefined : "primary"}
                        disabled={loadingId === course.id || !affords(course.pricePerSession)}
                        onClick={() => handleSubscribe(course, "per_session", "wallet")}
                      >
                        <Wallet className="size-4" aria-hidden />
                        {t("studentSubjects.payFromBalance")}
                        <Num>{formatEGP(course.pricePerSession)}</Num>
                      </LedgerButton>
                    ) : null}
                  </div>
                ) : null}
                {canOfferWallet ? (
                  <p
                    className="m-0 text-[12px] leading-relaxed sm:text-end"
                    style={{
                      color:
                        affords(course.pricePerMonth) || affords(course.pricePerSession)
                          ? "var(--ink-3)"
                          : "var(--red)",
                    }}
                  >
                    {affords(course.pricePerMonth) || affords(course.pricePerSession)
                      ? t("studentSubjects.balanceAvailable", {
                          amount: formatEGP(walletBalance ?? 0),
                        })
                      : t("studentSubjects.insufficientBalance", {
                          amount: formatEGP(walletBalance ?? 0),
                        })}
                  </p>
                ) : null}
                {!onlineCheckout &&
                !affords(course.pricePerMonth) &&
                !affords(course.pricePerSession) ? (
                  <p className="m-0 max-w-48 text-[12.5px] leading-relaxed text-ink-2 sm:text-end">
                    {t("studentSubjects.subscribeAtCenter")}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-3">
                <Num style={{ color: "var(--ink)", fontWeight: 600 }}>
                  {formatEGP(course.price ?? 0)}
                </Num>
                <LedgerButton
                  variant="primary"
                  disabled={loadingId === course.id}
                  onClick={() => handleRequest(course.id)}
                >
                  {loadingId === course.id ? <Spinner /> : null}
                  {t("studentBrowse.requestEnrollment")}
                </LedgerButton>
              </div>
            )}
          </div>
        </li>
      ))}

      {mockIntent ? (
        <li>
          <Hairline />
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Chip tone="amber">{t("studentSubjects.mockCheckoutTitle")}</Chip>
              <Num style={{ color: "var(--ink)", fontWeight: 600 }}>
                {formatEGP(mockIntent.amount)}
              </Num>
              <span style={{ color: "var(--ink-3)" }}>
                {t("studentSubjects.mockCheckoutHint")}
              </span>
            </div>
            <div className="flex gap-2">
              <LedgerButton
                variant="primary"
                disabled={mockBusy}
                onClick={() => completeMockPayment("success")}
              >
                {t("studentSubjects.mockPay")}
              </LedgerButton>
              <LedgerButton
                variant="danger"
                disabled={mockBusy}
                onClick={() => completeMockPayment("failure")}
              >
                {t("studentSubjects.mockFail")}
              </LedgerButton>
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
  const queryStrings = useQueryStrings();
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
            <SubjectCourses subjectId={id} browseAll={browseAll} />
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
