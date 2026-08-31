"use client";

import { useState } from "react";
import { useList, useCustom, useCustomMutation } from "@refinedev/core";
import { BookOpen, ChevronDown, Clock, MapPin, Archive, CreditCard, Wallet, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/components/card";
import { SearchInput } from "@repo/ui/components/search-input";
import { Button } from "@repo/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { toast } from "@repo/ui/components/sonner";
import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useChildSelector } from "@/components/ui/child-selector";
import { goToCheckout } from "@/lib/payments/checkout-redirect";
import { useOnlineCheckout } from "@/lib/payments/use-online-checkout";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { asArray } from "@/lib/refine/as-array";
import {
  stateBySubject,
  type SubscriptionRow,
} from "@/features/subscriptions/subscription-state";
import { SubscriptionStateChip } from "@/features/subscriptions/subscription-state-chip";
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
  subject: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  price: number;
  pricePerMonth: number | null;
  pricePerSession: number | null;
  maxStudents: number;
  activeEnrollmentCount: number;
  teacherName: string | null;
  center: { id: string; name: string; area: string | null } | null;
  upcomingSessions: UpcomingSession[];
};

const UNCATEGORIZED_ID = "none";

function newIdempotencyKey(courseId: string, plan: string): string {
  const stamp = Date.now().toString(36);
  const noise = Math.random().toString(36).slice(2, 8);
  return `psub-${courseId}-${plan}-${stamp}-${noise}`;
}

type PendingPurchase = {
  course: CourseHit;
  plan: "monthly" | "per_session";
  sessionId?: string;
  amount: number;
};

function SubjectCourses({
  subjectId,
  browseAll,
  childId,
  onPick,
}: {
  subjectId: string;
  browseAll: boolean;
  childId: string;
  onPick: (p: PendingPurchase) => void;
}) {
  const t = useTranslations();
  const { formatEGP, formatDate, formatClock, formatClockRange } = useFormatters();
  const courseStrings = useQueryStrings();
  const { query, result } = useList({
    resource: "search/courses",
    filters: [
      { field: "subjectId", operator: "eq", value: subjectId },
      { field: "studentId", operator: "eq", value: childId },
      ...(browseAll ? [{ field: "scope", operator: "eq" as const, value: "all" }] : []),
    ],
    pagination: { mode: "off" },
  });

  const [sessionChoice, setSessionChoice] = useState<Record<string, string>>({});

  const dayNames = [
    t("parentPay.sun"),
    t("parentPay.mon"),
    t("parentPay.tue"),
    t("parentPay.wed"),
    t("parentPay.thu"),
    t("parentPay.fri"),
    t("parentPay.sat"),
  ];

  const pick = (c: CourseHit, plan: "monthly" | "per_session") => {
    if (plan === "per_session") {
      const sessionId = sessionChoice[c.id];
      if (!sessionId) {
        toast.error(t("parentPay.pickSessionFirst"));
        return;
      }
      onPick({ course: c, plan, sessionId, amount: c.pricePerSession ?? 0 });
      return;
    }
    onPick({ course: c, plan, amount: c.pricePerMonth ?? 0 });
  };

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
        <Spinner /> {t("parentPay.loadingCourses")}
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
      <p className="px-4 py-6 text-sm text-muted-foreground">
        {t("parentPay.noCoursesForSubject")}
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
                  {formatClockRange(c.startTime, c.endTime)}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {c.center?.name ?? t("parentPay.noCenter")}
              </span>
            </div>
          </div>

          {c.pricePerMonth || c.pricePerSession ? (
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              {c.pricePerMonth ? (
                <Button size="sm" onClick={() => pick(c, "monthly")}>
                  {t("parentPay.payMonthly")} · {formatEGP(c.pricePerMonth)}
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
                      aria-label={t("parentPay.pickSession")}
                    >
                      <SelectValue placeholder={t("parentPay.pickSession")} />
                    </SelectTrigger>
                    <SelectContent>
                      {c.upcomingSessions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {formatDate(s.date, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · {formatClock(s.startTime)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => pick(c, "per_session")}>
                    {t("parentPay.payLesson")} · {formatEGP(c.pricePerSession)}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="shrink-0 text-xs text-muted-foreground">
              {t("parentPay.noPlansConfigured")}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ParentPayScreen() {
  const t = useTranslations();
  const { locale, formatEGP } = useFormatters();
  const {
    childId,
    childName,
    isLoading: childrenLoading,
    failed: childrenFailed,
  } = useChildSelector();
  const queryStrings = useQueryStrings();

  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPurchase | null>(null);
  const [busy, setBusy] = useState(false);
  const [mockIntent, setMockIntent] = useState<{ intentId: string; amount: number } | null>(null);

  const browseAll = tab === "all";

  const { query, result } = useList({
    resource: "catalog/subjects",
    filters: browseAll
      ? [{ field: "all", operator: "eq", value: "1" }]
      : [
          { field: "mine", operator: "eq", value: "1" },
          { field: "studentId", operator: "eq", value: childId ?? "" },
        ],
    pagination: { mode: "off" },
    queryOptions: { enabled: browseAll || Boolean(childId) },
  });

  const { query: subsQuery, result: subsRes } = useCustom({
    url: childId ? `me/subscriptions?studentId=${childId}` : "me/subscriptions",
    method: "get",
    queryOptions: { enabled: Boolean(childId) },
  });
  const subjectStates = stateBySubject(asArray<SubscriptionRow>(subsRes?.data));

  const { query: walletQuery, result: walletRes } = useCustom({
    url: "me/parent-wallet",
    method: "get",
  });
  const walletBalance: number | null = walletQuery.isError
    ? null
    : ((walletRes?.data as { balance?: number } | undefined)?.balance ?? null);

  const { mutateAsync: mutate } = useCustomMutation();

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

  const onlineCheckout = useOnlineCheckout();

  const pay = async (payFrom: "gateway" | "parent_wallet") => {
    if (!pending || !childId) return;
    setBusy(true);
    try {
      const res = await mutate({
        url: "subscriptions/checkout",
        method: "post",
        values: {
          courseId: pending.course.id,
          studentId: childId,
          plan: pending.plan,
          ...(pending.sessionId ? { sessionId: pending.sessionId } : {}),
          method: "card",
          payFrom,
          idempotencyKey: newIdempotencyKey(pending.course.id, pending.plan),
        },
      });
      const data = (res as any)?.data?.data ?? (res as any)?.data;

      if (payFrom === "parent_wallet") {
        toast.success(t("parentPay.paidFromWallet", { child: childName }));
        setPending(null);
        walletQuery.refetch();
        subsQuery.refetch();
        return;
      }

      if (data?.checkout?.url?.includes("mock-checkout")) {
        setMockIntent({ intentId: data.id, amount: data.amount });
      } else if (data?.checkout?.url) {
        goToCheckout(data.checkout.url);
      } else {
        toast.error(t("parentPay.checkoutFailed"));
      }
    } catch (err: any) {
      toast.error(err?.message || t("parentPay.checkoutFailed"));
    } finally {
      setBusy(false);
    }
  };

  const completeMock = async (outcome: "success" | "failure") => {
    if (!mockIntent) return;
    setBusy(true);
    try {
      await mutate({
        url: `payments/intents/${mockIntent.intentId}/mock-complete`,
        method: "post",
        values: { outcome },
      });
      if (outcome === "success") {
        toast.success(t("parentPay.activated", { child: childName }));
      } else {
        toast.error(t("parentPay.paymentDeclined"));
      }
    } catch (err: any) {
      toast.error(err?.message || t("parentPay.checkoutFailed"));
    } finally {
      setBusy(false);
      setMockIntent(null);
      setPending(null);
      walletQuery.refetch();
      subsQuery.refetch();
    }
  };

  const closeDialog = () => {
    if (busy) return;
    setPending(null);
    setMockIntent(null);
  };

  if (childrenLoading) return <PageSpinner />;

  if (childrenFailed) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("nav.payForChild")} description={t("parentPay.subtitle")} />
        <EmptyState icon={Users} title={t("parentPay.childrenUnavailable")} />
      </div>
    );
  }

  if (!childId) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("nav.payForChild")} description={t("parentPay.subtitle")} />
        <EmptyState icon={Users} title={t("parentPay.noLinkedChildren")} />
      </div>
    );
  }

  const renderSubjectRow = (id: string, title: string, subtitle?: string, legacy?: boolean) => {
    const expanded = expandedId === id;
    const state = subjectStates.get(id);
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
          {state ? <SubscriptionStateChip state={state} /> : null}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        {expanded && (
          <div className="border-t border-border bg-muted/20">
            <SubjectCourses
              subjectId={id}
              browseAll={browseAll}
              childId={childId}
              onPick={setPending}
            />
          </div>
        )}
      </Card>
    );
  };

  const insufficient =
    pending && walletBalance !== null ? walletBalance < pending.amount : false;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          childName
            ? t("parentPay.titleFor", { name: childName })
            : t("nav.payForChild")
        }
        description={t("parentPay.subtitle")}
      />

      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="mine">{t("parentPay.childSubjectsTab")}</TabsTrigger>
          <TabsTrigger value="all">{t("parentPay.allSubjectsTab")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {browseAll && (
        <SearchInput
            className="max-w-md"
            placeholder={t("parentPay.searchPlaceholder")}
            value={search}
            onValueChange={(v) => setSearch(v)}
            onClear={() => setSearch("")}
            clearLabel={t("parentPay.searchPlaceholder")}
          />
      )}

      {!browseAll && (
        <p className="text-sm text-muted-foreground">
          {t("parentPay.childSubjectsHint", { child: childName })}
        </p>
      )}

      {query.isLoading && <PageSpinner label={t("parentPay.loadingSubjects")} />}

      {query.isError && (
        <LoadError
          message={queryStrings.loadFailed}
          onRetry={() => query.refetch()}
          retryLabel={queryStrings.retry}
        />
      )}

      {!query.isLoading && !query.isError && visibleSubjects.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title={
            browseAll ? t("parentPay.noSubjectsFound") : t("parentPay.noTrackSubjects")
          }
        />
      )}

      <div className="space-y-3">
        {visibleSubjects.map((s) =>
          renderSubjectRow(s.id, subjectName(s), locale === "ar" ? s.nameEn : s.nameAr),
        )}
        {browseAll &&
          !query.isLoading &&
          renderSubjectRow(
            UNCATEGORIZED_ID,
            t("parentPay.uncategorized"),
            t("parentPay.uncategorizedHint"),
            true,
          )}
      </div>

      <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("parentPay.confirmTitle")}</DialogTitle>
          </DialogHeader>

          {pending && !mockIntent && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="font-medium text-foreground">{pending.course.title}</div>
                <div className="text-muted-foreground">
                  {pending.plan === "monthly"
                    ? t("parentPay.planMonthly")
                    : t("parentPay.planPerSession")}
                  {" · "}
                  {childName}
                </div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {formatEGP(pending.amount)}
                </div>
              </div>

              <div className="space-y-2">
                {onlineCheckout ? (
                  <Button className="w-full justify-start" disabled={busy} onClick={() => pay("gateway")}>
                    <CreditCard className="size-4" />
                    {t("parentPay.payByCard")}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled={busy || insufficient || walletBalance === null}
                  onClick={() => pay("parent_wallet")}
                >
                  <Wallet className="size-4" />
                  {t("parentPay.payFromWallet")}
                  {walletBalance !== null ? <> · {formatEGP(walletBalance)}</> : null}
                </Button>
                {insufficient && (
                  <p className="text-xs text-destructive">{t("parentPay.insufficientWallet")}</p>
                )}
                {walletBalance === null && !walletQuery.isPending && (
                  <LoadError
                    message={queryStrings.unavailable}
                    onRetry={() => walletQuery.refetch()}
                    retryLabel={queryStrings.retry}
                  />
                )}
              </div>
            </div>
          )}

          {mockIntent && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("parentPay.mockPrompt", { amount: formatEGP(mockIntent.amount) })}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => completeMock("success")} disabled={busy}>
                  {busy ? <Spinner /> : null}
                  {t("parentPay.mockPay")}
                </Button>
                <Button variant="outline" onClick={() => completeMock("failure")} disabled={busy}>
                  {t("parentPay.mockFail")}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={busy}>
              {t("actions.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
