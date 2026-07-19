"use client";

import { useState, useEffect } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import { BookOpen, AlertTriangle } from "lucide-react";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
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
import { Progress } from "@repo/ui/components/progress";
import { cn } from "@repo/ui/lib/utils";

type Session = Record<string, any>;

const statusTones: Record<string, StatusTone> = {
  scheduled: "info",
  completed: "success",
  cancelled: "danger",
  postponed: "warning",
};

export function TeacherClassesScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "courses",
    filters: [{ field: "teacherId", operator: "eq", value: "me" }],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const classes = (coursesResult?.data ?? []) as any[];

  useEffect(() => {
    if (classes.length > 0 && !selectedId) {
      setSelectedId(classes[0].id || classes[0]._id);
    }
  }, [classes, selectedId]);

  const { query: sessionsQuery, result: sessionsResult } = useList({
    resource: "sessions",
    filters: selectedId ? [{ field: "courseId", operator: "eq", value: selectedId }] : undefined,
    queryOptions: { enabled: !!selectedId },
  });

  const { mutate: cancelSessionMut, mutation: cancelMutation } = useCustomMutation();
  const { mutate: postponeSessionMut, mutation: postponeMutation } = useCustomMutation();

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [postponingId, setPostponingId] = useState<string | null>(null);
  const [postponeDate, setPostponeDate] = useState<dayjs.Dayjs | null>(null);
  const [postponeStart, setPostponeStart] = useState<dayjs.Dayjs | null>(null);
  const [postponeEnd, setPostponeEnd] = useState<dayjs.Dayjs | null>(null);
  const [postponeReason, setPostponeReason] = useState("");

  const courseSessions = (sessionsResult?.data ?? []) as any[];

  const handleCancelSession = async (session: any) => {
    if (!cancelReason || !selectedId) return;
    cancelSessionMut(
      {
        url: `sessions/${session.id || session._id}/cancel`,
        method: "post",
        values: { reason: cancelReason },
      },
      {
        onSuccess: () => {
          setCancellingId(null);
          setCancelReason("");
        },
      }
    );
  };

  const handlePostponeSession = async (session: any) => {
    if (!postponeDate || !postponeStart || !postponeEnd || !postponeReason || !selectedId) return;
    postponeSessionMut(
      {
        url: `sessions/${session.id || session._id}/postpone`,
        method: "post",
        values: {
          newDate: postponeDate.format("YYYY-MM-DD"),
          newStartTime: postponeStart.format("HH:mm"),
          newEndTime: postponeEnd.format("HH:mm"),
          reason: postponeReason,
        },
      },
      {
        onSuccess: () => {
          setPostponingId(null);
          setPostponeDate(null);
          setPostponeStart(null);
          setPostponeEnd(null);
          setPostponeReason("");
        },
      }
    );
  };

  const selectedCourse = classes.find((c: any) => (c.id || c._id) === selectedId) || classes[0];

  const sessionColumns: ColumnDef<Session>[] = [
    {
      id: "date",
      header: t("teacher.date"),
      cell: ({ row }) => {
        const s = row.original;
        return (
          <span className="font-semibold">
            {formatDate(s.date)} (
            <span dir="ltr">
              {s.startTime} - {s.endTime}
            </span>
            )
          </span>
        );
      },
    },
    {
      id: "status",
      header: t("teacher.status"),
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-2">
            <StatusBadge tone={statusTones[s.status] ?? "neutral"}>
              {t(asKey("status." + s.status))}
            </StatusBadge>
            {s.cancelReason && (
              <span className="text-xs text-muted-foreground">{s.cancelReason}</span>
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: t("teacher.actions"),
      cell: ({ row }) => {
        const s = row.original;
        if (s.status !== "scheduled") return null;
        const sid = s.id || s._id;

        if (cancellingId === sid) {
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder={t("teacher.reason")}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="h-8 w-32"
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleCancelSession(s)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? <Spinner /> : null}
                {t("actions.cancel")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCancellingId(null);
                  setCancelReason("");
                }}
              >
                {t("teacher.abort")}
              </Button>
            </div>
          );
        }

        if (postponingId === sid) {
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                aria-label={t("teacher.date")}
                value={postponeDate ? postponeDate.format("YYYY-MM-DD") : ""}
                onChange={(e) =>
                  setPostponeDate(e.target.value ? dayjs(e.target.value) : null)
                }
                className="h-8 w-auto"
              />
              <Input
                type="time"
                aria-label={t("teacher.start")}
                value={postponeStart ? postponeStart.format("HH:mm") : ""}
                onChange={(e) =>
                  setPostponeStart(e.target.value ? dayjs(e.target.value, "HH:mm") : null)
                }
                className="h-8 w-auto"
              />
              <Input
                type="time"
                aria-label={t("teacher.end")}
                value={postponeEnd ? postponeEnd.format("HH:mm") : ""}
                onChange={(e) =>
                  setPostponeEnd(e.target.value ? dayjs(e.target.value, "HH:mm") : null)
                }
                className="h-8 w-auto"
              />
              <Input
                placeholder={t("teacher.reason")}
                value={postponeReason}
                onChange={(e) => setPostponeReason(e.target.value)}
                className="h-8 w-32"
              />
              <Button
                size="sm"
                onClick={() => handlePostponeSession(s)}
                disabled={postponeMutation.isPending}
              >
                {postponeMutation.isPending ? <Spinner /> : null}
                {t("teacher.postpone")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPostponingId(null);
                  setPostponeDate(null);
                  setPostponeStart(null);
                  setPostponeEnd(null);
                  setPostponeReason("");
                }}
              >
                {t("teacher.abort")}
              </Button>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPostponingId(sid);
                setPostponeDate(dayjs(s.date));
                setPostponeStart(dayjs(s.startTime, "HH:mm"));
                setPostponeEnd(dayjs(s.endTime, "HH:mm"));
              }}
            >
              {t("teacher.postpone")}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setCancellingId(sid)}>
              {t("actions.cancel")}
            </Button>
          </div>
        );
      },
    },
  ];

  if (coursesQuery.isLoading && classes.length === 0) {
    return <PageSpinner label={t("teacher.loadingClasses")} />;
  }

  if (coursesQuery.isError && classes.length === 0) {
    return <EmptyState icon={AlertTriangle} title={t("teacher.loadError")} />;
  }

  if (classes.length === 0) {
    return <EmptyState icon={BookOpen} title={t("teacher.noClasses")} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <div className="flex flex-col gap-2 lg:col-span-1">
        {classes.map((c: any, i: number) => {
          const isSelected = selectedId === (c.id || c._id);
          return (
            <Card
              key={c.id || c._id || i}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(c.id || c._id)}
              className={cn(
                "cursor-pointer gap-0 p-3 transition-colors",
                isSelected
                  ? "border-2 border-primary"
                  : "border-2 border-border hover:border-primary/40"
              )}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 shrink-0 text-primary" />
                <div>
                  <div className="font-semibold">
                    {c.subject} - {c.gradeTag}
                  </div>
                  <div className="text-xs text-muted-foreground">
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
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-bold">
                {selectedCourse.subject} - {selectedCourse.gradeTag}
              </span>
              <StatusBadge
                tone={selectedCourse.status === "active" ? "success" : "neutral"}
              >
                {t(asKey("status." + selectedCourse.status))}
              </StatusBadge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{selectedCourse.roomName || t("teacher.tbd")}</span>
              <span>
                {selectedCourse.schedulePattern?.daysOfWeek?.join(", ") ||
                  t("teacher.tbd")}{" "}
                ·{" "}
                <span dir="ltr">
                  {selectedCourse.schedulePattern?.startTime} -{" "}
                  {selectedCourse.schedulePattern?.endTime}
                </span>
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
            {!selectedCourse.pricePerMonth && !selectedCourse.pricePerSession ? (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                {t("teacher.unpricedNotice")}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("nav.sessions")}</CardTitle>
          </CardHeader>
          <CardContent>
            {sessionsQuery.isLoading ? (
              <PageSpinner />
            ) : (
              <DataTable
                columns={sessionColumns}
                data={courseSessions}
                pageSize={courseSessions.length || 1}
                emptyState={t("teacher.noSessions")}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
