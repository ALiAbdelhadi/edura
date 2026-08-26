"use client";

import { useState } from "react";
import { useOnlineCheckout } from "@/lib/payments/use-online-checkout";
import { useCustom, useList, useCustomMutation } from "@refinedev/core";
import { BookOpen, ChevronDown, Clock, MapPin, Archive, Users } from "lucide-react";
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

/** Sentinel understood by /api/v1/search/courses: subjectId=none ⇒ uncatalogued (subjectId IS NULL). */
const UNCATEGORIZED_ID = "none";

/**
 * Subjects — the one screen in this portal where a student SPENDS.
 *
 * REBUILT ONTO THE LEDGER KIT (shadcn `Card` rows → `Sheet`, `Button` →
 * `LedgerButton`), and three things beyond the kit were wrong:
 *
 * 1. EVERY PRICE WAS PLAIN PROSE. `formatEGP(...)` was interpolated straight
 *    into an Arabic button label, so a Latin amount and its currency sat
 *    unisolated inside an RTL run — the exact bidi break §6.2 exists to stop,
 *    on the figure the student is being asked to authorise. Prices now go
 *    through `<Num>`, which isolates and sets them in mono like every other
 *    figure in the product.
 * 2. THE SESSION PICKER HAD NO LOCALE. `new Date(s.date).toLocaleDateString()`
 *    formats in the BROWSER's locale, so an Arabic page offered "8/6/2026" or
 *    worse depending on whose phone it was. It now uses the app's formatter,
 *    and it shows the weekday — which is how anyone actually picks a lesson.
 * 3. A SUCCESSFUL PAYMENT DID NOT REFRESH THE LIST. `refreshKey` was
 *    incremented and then discarded through `void refreshKey`, so after paying
 *    the student was left looking at the same "book this" button they had just
 *    used. The list refetches now.
 *
 * The shadcn `Tabs`/`Select`/`SearchInput` stay: they are @repo/ui form
 * primitives drawing from the same tokens, the Ledger kit offers no substitute,
 * and hand-rolling a tablist would trade working keyboard semantics for a
 * cosmetic match.
 */
function SubjectCourses({ subjectId, browseAll }: { subjectId: string; browseAll: boolean }) {
  const t = useTranslations();
  const { formatEGP, formatDate, formatClock, locale } = useFormatters();
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
  // MVP blocker #2: when online checkout cannot settle, the subscribe
  // buttons are ABSENT and an honest note points at the center's counter —
  // which is where an MVP subscription actually happens.
  const onlineCheckout = useOnlineCheckout();

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
          idempotencyKey: newIdempotencyKey(`sub-${course.id}-${plan}`),
        },
      });
      const intent = (res as any)?.data?.data ?? (res as any)?.data;
      if (intent?.checkout?.url?.includes("mock-checkout")) {
        setMockIntent({ intentId: intent.id, amount: intent.amount });
      } else if (intent?.checkout?.url) {
        // Was `window.open(url, "_blank")`. Called after the await above it
        // sits outside the click's gesture stack and mobile Safari blocks it —
        // the student pressed subscribe and nothing happened, with no error.
        // See lib/payments/checkout-redirect.ts.
        goToCheckout(intent.checkout.url);
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
      if (outcome === "success") toast.success(t("studentSubjects.subscriptionActive"));
      else toast.error(t("studentSubjects.paymentDeclined"));
    } catch (err: any) {
      toast.error(err?.message || t("studentSubjects.checkoutFailed"));
    } finally {
      setMockIntent(null);
      // Was `setRefreshKey(k => k + 1)` followed by `void refreshKey`: the list
      // never reloaded, so a student who had just paid was still looking at the
      // button that took their money.
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
                  // A bare "8/30" names nothing. The label is what makes it a
                  // seat count rather than two numbers.
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

            {(course.pricePerMonth || course.pricePerSession) && !onlineCheckout ? (
              <p className="m-0 max-w-48 shrink-0 self-center text-[12.5px] leading-relaxed text-ink-2 sm:text-end">
                {t("studentSubjects.subscribeAtCenter")}
              </p>
            ) : null}
            {(course.pricePerMonth || course.pricePerSession) && onlineCheckout ? (
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                {course.pricePerMonth ? (
                  /* The button carries its own amount (§1). The amount is a
                     figure, so it is isolated and mono like every other. */
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
                {course.pricePerSession ? (
                  <div className="flex items-center gap-2">
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
                    <LedgerButton
                      disabled={loadingId === course.id}
                      onClick={() => handleSubscribe(course, "per_session")}
                    >
                      {t("studentSubjects.bookSession")}
                      <Num>{formatEGP(course.pricePerSession)}</Num>
                    </LedgerButton>
                  </div>
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
              {/* Driven by the gateway's own response, so this cannot appear
                  against a real gateway. Labelled so it can never be mistaken
                  for a real payment step. */}
              <Chip tone="amber">{t("studentSubjects.mockCheckoutTitle")}</Chip>
              <Num style={{ color: "var(--ink)", fontWeight: 600 }}>
                {formatEGP(mockIntent.amount)}
              </Num>
              <span style={{ color: "var(--ink-3)" }}>
                {t("studentSubjects.mockCheckoutHint")}
              </span>
            </div>
            <div className="flex gap-2">
              <LedgerButton variant="primary" onClick={() => completeMockPayment("success")}>
                {t("studentSubjects.mockPay")}
              </LedgerButton>
              <LedgerButton variant="danger" onClick={() => completeMockPayment("failure")}>
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

  /* WHICH OF THESE AM I ALREADY PAYING FOR?
     Until now a subject the student subscribes to and a subject they have
     never touched rendered identically, so the "موادي" tab could not be told
     apart from a catalogue. `me/subscriptions` answers it — the same endpoint
     the home alert and the subscriptions page read, through the same
     derivation, so the three can never disagree about what "قرب يخلص" means.

     `subjectId` on a subscription is a nullable snapshot: a row without one
     attaches to nothing rather than being guessed onto a subject. */
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
          /* The visible label is composed of nested spans beside a decorative
             tile, and the accessibility tree was reporting the control with NO
             name at all — a row of unnamed expanders. Named explicitly. */
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
          {/* The state rides on the row, not inside it: the whole point is to
              be readable WITHOUT expanding, so the student can scan the list
              and see which subjects are covered. */}
          {state ? <SubscriptionStateChip state={state} /> : null}
          {/* Vertical rotation only — a chevron that points DOWN does not lie in
              RTL, so this one is not a directional icon. */}
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

      {!query.isLoading && visibleSubjects.length === 0 ? (
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
