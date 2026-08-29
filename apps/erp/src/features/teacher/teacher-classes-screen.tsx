"use client";

import { useMemo, useState, useEffect } from "react";
import {
  useCustom,
  useGetIdentity,
  useList,
  useCustomMutation,
} from "@refinedev/core";
import dayjs from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, BookOpen, CheckSquare, GraduationCap } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useParamSeed } from "@/lib/api/use-param-seed";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Progress } from "@repo/ui/components/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import { platformDayKey, todayKey } from "@repo/server-core/lib/date-key";
import { asArray } from "@/lib/refine/as-array";
import { ATTENDANCE_WINDOW_DAYS } from "@/features/teacher/teacher-attendance-screen";
import { TeacherCreateGroupDialog } from "@/features/teacher/teacher-create-group-dialog";

type Session = Record<string, any>;

const statusTones: Record<string, StatusTone> = {
  scheduled: "info",
  completed: "success",
  cancelled: "danger",
  postponed: "warning",
};

export function TeacherClassesScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const listSeparator = locale === "ar" ? "، " : ", ";
  const { formatDate, formatClockRange } = useFormatters();
  const dayNames = [
    t("studentBrowse.sun"),
    t("studentBrowse.mon"),
    t("studentBrowse.tue"),
    t("studentBrowse.wed"),
    t("studentBrowse.thu"),
    t("studentBrowse.fri"),
    t("studentBrowse.sat"),
  ];
  const courseLabel = (c: any) =>
    c.title || [c.subject, c.gradeTag].filter(Boolean).join(" — ");

  const { data: identity } = useGetIdentity<{ role?: string }>();
  const canCreateGroup = identity?.role === "teacher";
  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "courses",
    filters: [{ field: "teacherId", operator: "eq", value: "me" }],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useParamSeed("courseId", setSelectedId);

  const classes = (coursesResult?.data ?? []) as any[];

  const { result: affiliationsResult } = useCustom<any[]>({
    url: "me/affiliations",
    method: "get",
  });
  const centerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of asArray<any>(affiliationsResult?.data)) {
      if (a?.center?.id && a?.center?.name) map.set(a.center.id, a.center.name);
    }
    return map;
  }, [affiliationsResult?.data]);

  const placeOf = (c: any): string =>
    c?.centerId
      ? (centerNames.get(c.centerId) ?? "")
      : (c?.location?.trim() || t("teacher.yourGroup"));

  useEffect(() => {
    if (classes.length > 0 && !selectedId) {
      setSelectedId(classes[0].id);
    }
  }, [classes, selectedId]);

  const { query: sessionsQuery, result: sessionsResult } = useList({
    resource: "sessions",
    filters: selectedId ? [{ field: "courseId", operator: "eq", value: selectedId }] : undefined,
    queryOptions: { enabled: !!selectedId },
  });

  const { mutate: cancelSessionMut, mutation: cancelMutation } = useCustomMutation();
  const { mutate: postponeSessionMut, mutation: postponeMutation } = useCustomMutation();

  const [editing, setEditing] = useState<
    { mode: "cancel" | "postpone"; session: Session } | null
  >(null);
  const [reason, setReason] = useState("");
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeStart, setPostponeStart] = useState("");
  const [postponeEnd, setPostponeEnd] = useState("");

  const closeEditor = () => {
    setEditing(null);
    setReason("");
    setPostponeDate("");
    setPostponeStart("");
    setPostponeEnd("");
  };

  const openCancel = (s: Session) => {
    setEditing({ mode: "cancel", session: s });
    setReason("");
  };

  const openPostpone = (s: Session) => {
    setEditing({ mode: "postpone", session: s });
    setReason("");
    setPostponeDate(dayjs(s.date).format("YYYY-MM-DD"));
    setPostponeStart(s.startTime ?? "");
    setPostponeEnd(s.endTime ?? "");
  };

  const courseSessions = (sessionsResult?.data ?? []) as any[];

  const today = todayKey();
  const isUnsettled = (s: Session) =>
    platformDayKey(String(s.date)) < today &&
    (s.status === "scheduled" || s.status === "postponed");

  const isReachable = (s: Session) =>
    dayjs(s.date).isAfter(dayjs().subtract(ATTENDANCE_WINDOW_DAYS, "day"));

  const handleCancelSession = () => {
    const s = editing?.session;
    if (!s || !reason.trim()) return;
    cancelSessionMut(
      {
        url: `sessions/${s.id}/cancel`,
        method: "post",
        values: { reason: reason.trim() },
      },
      {
        onSuccess: () => {
          toast.success(t("teacher.saved"));
          closeEditor();
          sessionsQuery.refetch();
        },
        onError: (err) =>
          toast.error((err as { message?: string })?.message || t("teacher.actionFailed")),
      },
    );
  };

  const handlePostponeSession = () => {
    const s = editing?.session;
    if (!s || !postponeDate || !postponeStart || !postponeEnd || !reason.trim()) return;
    postponeSessionMut(
      {
        url: `sessions/${s.id}/postpone`,
        method: "post",
        values: {
          newDate: postponeDate,
          newStartTime: postponeStart,
          newEndTime: postponeEnd,
          reason: reason.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success(t("teacher.saved"));
          closeEditor();
          sessionsQuery.refetch();
        },
        onError: (err) =>
          toast.error((err as { message?: string })?.message || t("teacher.actionFailed")),
      },
    );
  };

  if (coursesQuery.isLoading && classes.length === 0) {
    return <PageSpinner label={t("teacher.loadingClasses")} />;
  }

  if (coursesQuery.isError && classes.length === 0) {
    return <EmptyState icon={AlertTriangle} title={t("teacher.loadError")} />;
  }

  if (classes.length === 0) {
    return (
      <div className="space-y-4">
        {canCreateGroup ? (
          <div className="flex justify-end">
            <TeacherCreateGroupDialog onCreated={() => coursesQuery.refetch()} />
          </div>
        ) : null}
        <EmptyState icon={BookOpen} title={t("teacher.noClasses")} />
      </div>
    );
  }

  const selectedCourse =
    classes.find((c: any) => (c.id) === selectedId) || classes[0];
  const selectedPlace = placeOf(selectedCourse);
  const unpriced =
    !selectedCourse.pricePerMonth && !selectedCourse.pricePerSession;

  return (
    <div className="space-y-4">
      {canCreateGroup ? (
        <div className="flex justify-end">
          <TeacherCreateGroupDialog onCreated={() => coursesQuery.refetch()} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="flex flex-col gap-2 lg:col-span-1">
          {classes.map((c: any, i: number) => {
            const isSelected = selectedId === (c.id);
            const place = placeOf(c);
            return (
              <Card
                key={c.id || i}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "cursor-pointer gap-0 p-3 transition-colors",
                  isSelected
                    ? "border-2 border-primary"
                    : "border-2 border-border hover:border-primary/40"
                )}
              >
                <div className="flex items-start gap-2">
                  <BookOpen className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="font-semibold">{courseLabel(c)}</div>
                    {place ? (
                      <div className="mt-1">
                        <StatusBadge tone={c.centerId ? "info" : "neutral"}>
                          {place}
                        </StatusBadge>
                      </div>
                    ) : null}
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span dir="ltr">
                        {c.enrolledStudentsCount || 0}/{c.maxStudents}
                      </span>{" "}
                      {t("teacher.students")}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-3">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-bold">{courseLabel(selectedCourse)}</span>
                <StatusBadge
                  tone={selectedCourse.status === "active" ? "success" : "neutral"}
                >
                  {t(asKey("status." + selectedCourse.status))}
                </StatusBadge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {selectedPlace ? (
                  <span className="font-medium text-foreground">{selectedPlace}</span>
                ) : null}
                <span>{selectedCourse.roomName || t("teacher.tbd")}</span>
                <span>
                  {selectedCourse.schedulePattern?.daysOfWeek
                    ?.map((d: number) => dayNames[d] ?? d)
                    .join(listSeparator) || t("teacher.tbd")}{" "}
                  ·{" "}
                  {formatClockRange(
                    selectedCourse.schedulePattern?.startTime,
                    selectedCourse.schedulePattern?.endTime,
                  )}
                </span>
                <span>
                  <span dir="ltr">
                    {selectedCourse.enrolledStudentsCount || 0}/
                    {selectedCourse.maxStudents}
                  </span>{" "}
                  {t("teacher.students")}
                </span>
              </div>
              <Progress
                value={Math.round(
                  ((selectedCourse.enrolledStudentsCount || 0) /
                    selectedCourse.maxStudents) *
                    100
                )}
              />

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/teacher/attendance">
                    <CheckSquare className="size-4" />
                    {t("teacher.openRegister")}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/dashboard/teacher/grades?courseId=${selectedCourse.id}`}
                  >
                    <GraduationCap className="size-4" />
                    {t("nav.gradebook")}
                  </Link>
                </Button>
              </div>

              {unpriced ? (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
                  {selectedCourse.centerId
                    ? t("teacher.unpricedCenter")
                    : t("teacher.unpricedOwn")}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("nav.sessions")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {sessionsQuery.isLoading ? (
                <PageSpinner />
              ) : courseSessions.length === 0 ? (
                <div className="px-6">
                  <EmptyState title={t("teacher.noSessions")} />
                </div>
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {courseSessions.map((s: any) => {
                    const sid = s.id;
                    return (
                      <li
                        key={sid}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">
                            {formatDate(s.date, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                            {" · "}
                            {formatClockRange(s.startTime, s.endTime)}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <StatusBadge tone={statusTones[s.status] ?? "neutral"}>
                              {t(asKey("status." + s.status))}
                            </StatusBadge>
                            {isUnsettled(s) ? (
                              isReachable(s) ? (
                                <Link href={`/dashboard/teacher/attendance?sessionId=${sid}`}>
                                  <StatusBadge tone="warning">
                                    {t("teacher.notClosedYet")}
                                  </StatusBadge>
                                </Link>
                              ) : (
                                <StatusBadge tone="warning">
                                  {t("teacher.notClosedYet")}
                                </StatusBadge>
                              )
                            ) : null}
                            {s.cancelReason ? (
                              <span className="text-xs text-muted-foreground">
                                {s.cancelReason}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        {s.status === "scheduled" ? (
                          <span className="flex shrink-0 items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPostpone(s)}
                            >
                              {t("teacher.postpone")}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openCancel(s)}
                            >
                              {t("actions.cancel")}
                            </Button>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => (open ? null : closeEditor())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.mode === "cancel"
                ? t("teacher.cancelSessionTitle")
                : t("teacher.postponeSessionTitle")}
            </DialogTitle>
          </DialogHeader>

          {editing ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {formatDate(editing.session.date, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
                {" · "}
                {formatClockRange(editing.session.startTime, editing.session.endTime)}
              </p>

              {editing.mode === "postpone" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="postpone-date">{t("teacher.date")}</Label>
                    <Input
                      id="postpone-date"
                      type="date"
                      value={postponeDate}
                      onChange={(e) => setPostponeDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="postpone-start">{t("teacher.start")}</Label>
                    <Input
                      id="postpone-start"
                      type="time"
                      value={postponeStart}
                      onChange={(e) => setPostponeStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="postpone-end">{t("teacher.end")}</Label>
                    <Input
                      id="postpone-end"
                      type="time"
                      value={postponeEnd}
                      onChange={(e) => setPostponeEnd(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <Label htmlFor="session-reason">{t("teacher.reason")}</Label>
                <Input
                  id="session-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("teacher.reason")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("teacher.reasonRequired")}
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>
              {t("teacher.abort")}
            </Button>
            {editing?.mode === "cancel" ? (
              <Button
                variant="destructive"
                disabled={!reason.trim() || cancelMutation.isPending}
                onClick={handleCancelSession}
              >
                {cancelMutation.isPending ? <Spinner /> : null}
                {t("actions.cancel")}
              </Button>
            ) : (
              <Button
                disabled={
                  !reason.trim() ||
                  !postponeDate ||
                  !postponeStart ||
                  !postponeEnd ||
                  postponeMutation.isPending
                }
                onClick={handlePostponeSession}
              >
                {postponeMutation.isPending ? <Spinner /> : null}
                {t("teacher.postpone")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
