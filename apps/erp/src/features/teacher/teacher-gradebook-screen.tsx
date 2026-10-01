"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useList, useCustomMutation, useCreate } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Plus, GraduationCap, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useParamSeed } from "@/lib/api/use-param-seed";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/components/form";
import { toast } from "@repo/ui/components/sonner";
import { LoadError } from "@repo/ui/components/ledger";
import {
  combineQueries,
  QuerySection,
  useQueryStrings,
} from "@repo/ui/components/query-section";
import { cn } from "@repo/ui/lib/utils";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { BarChart } from "@/components/charts";
import { GRADE_BANDS, bandForPercent, percentOf } from "@repo/shared/grading-scale";
import { QUERY_FRESHNESS } from "@/lib/refine";

interface RawGrade {
  id: string;
  courseId: string;
  name: string;
  gradeType?: "numeric" | "letter";
  maxScore: number;
  date: string;
  scores: Array<{ studentId: string; score: number }>;
}

const BAND_OPTIONS = [...GRADE_BANDS].sort((a, b) => b.ordinal - a.ordinal);

interface GradeEntry {
  id: string;
  title: string;
  type: string;
  gradeType: "numeric" | "letter";
  maxScore: number;
  date: string;
}

interface StudentGradeRow {
  studentId: string;
  studentName: string;
  scores: Record<string, number>;
}

const ENTRY_ATTR = "data-grade-entry";

export function TeacherGradebookScreen() {
  const t = useTranslations();
  const { formatDate, formatPercent } = useFormatters();
  const queryStrings = useQueryStrings();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  useParamSeed("courseId", setSelectedCourseId);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editedGrades, setEditedGrades] = useState<Record<string, Record<string, number>>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);

  const createSchema = useMemo(
    () =>
      z
        .object({
          name: z.string().min(1, t("teacher.nameRequired")),
          gradeType: z.enum(["numeric", "letter"]),
          maxScore: z.number().min(1).optional(),
          date: z.string().min(1, t("teacher.dateRequired")),
        })
        .refine(
          (v) => v.gradeType === "letter" || (v.maxScore !== undefined && v.maxScore >= 1),
          { message: t("teacher.maxScoreRequired"), path: ["maxScore"] },
        ),
    [t],
  );

  const createForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", gradeType: "numeric", maxScore: 100, date: "" },
  });
  const watchedGradeType = createForm.watch("gradeType");

  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "courses",
    pagination: { mode: "off" },
    queryOptions: QUERY_FRESHNESS.list,
  });
  const courses = (coursesResult?.data ?? []) as any[];

  const { query: gradesQuery, result: gradesResult } = useList({
    resource: "grades",
    filters: selectedCourseId
      ? [{ field: "courseId", operator: "eq" as const, value: selectedCourseId }]
      : [],
    pagination: { mode: "off" },
    queryOptions: { ...QUERY_FRESHNESS.list, enabled: !!selectedCourseId },
  });
  const rawGrades = (gradesResult?.data ?? []) as unknown as RawGrade[];

  const { query: enrollmentsQuery, result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: selectedCourseId
      ? [{ field: "courseId", operator: "eq" as const, value: selectedCourseId }]
      : [],
    pagination: { mode: "off" },
    queryOptions: { ...QUERY_FRESHNESS.list, enabled: !!selectedCourseId },
  });
  const studentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of (enrollmentsResult?.data ?? []) as any[]) {
      map.set(e.studentId.toString(), e.studentName);
    }
    return map;
  }, [enrollmentsResult]);

  const { mutateAsync: saveScores, mutation: saveMutation } = useCustomMutation<any>();
  const { mutate: createGrade, mutation: createMutation } = useCreate();

  const handleCreate = (values: z.infer<typeof createSchema>) => {
    if (!selectedCourseId) return;
    createGrade(
      {
        resource: "grades",
        values: {
          courseId: selectedCourseId,
          name: values.name.trim(),
          gradeType: values.gradeType || "numeric",
          maxScore: values.gradeType === "letter" ? 4 : values.maxScore,
          date: values.date,
        },
      },
      {
        onSuccess: () => {
          toast.success(`${t("teacher.assignmentCreated")}: "${values.name}"`);
          setIsCreateOpen(false);
          createForm.reset();
        },
        onError: (err: any) => {
          toast.error(err?.message || t("teacher.createFailed"));
        },
      }
    );
  };

  useEffect(() => {
    if (courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  const entries: GradeEntry[] = useMemo(
    () =>
      rawGrades.map((g) => ({
        id: g.id,
        title: g.name,
        type: "exam",
        gradeType: g.gradeType || "numeric",
        maxScore: g.maxScore,
        date: g.date,
      })),
    [rawGrades],
  );

  const entriesByRecency = useMemo(
    () =>
      [...entries].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [entries],
  );

  useEffect(() => {
    if (entriesByRecency.length === 0) {
      setSelectedEntryId(null);
      return;
    }
    if (
      !selectedEntryId ||
      !entriesByRecency.some((entry) => entry.id === selectedEntryId)
    ) {
      setSelectedEntryId(entriesByRecency[0].id);
    }
  }, [entriesByRecency, selectedEntryId]);

  const studentGrades: StudentGradeRow[] = useMemo(() => {
    const studentMap = new Map<string, StudentGradeRow>();
    for (const e of (enrollmentsResult?.data ?? []) as any[]) {
      const sid = e.studentId.toString();
      studentMap.set(sid, {
        studentId: sid,
        studentName: e.studentName ?? sid,
        scores: {},
      });
    }
    for (const g of rawGrades) {
      for (const s of g.scores ?? []) {
        const sid = s.studentId.toString();
        if (!studentMap.has(sid)) {
          studentMap.set(sid, {
            studentId: sid,
            studentName: studentNameMap.get(sid) ?? sid,
            scores: {},
          });
        }
        studentMap.get(sid)!.scores[g.id] = s.score;
      }
    }
    return Array.from(studentMap.values());
  }, [rawGrades, studentNameMap, enrollmentsResult]);

  const focusEntry = useMemo(
    () => entries.find((e) => e.id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  );

  const scoreFor = useCallback(
    (row: StudentGradeRow, entryId: string): number | undefined => {
      const edited = editedGrades[row.studentId]?.[entryId];
      return edited !== undefined ? edited : row.scores?.[entryId];
    },
    [editedGrades],
  );

  const gradedCount = useMemo(() => {
    if (!focusEntry) return 0;
    return studentGrades.filter((r) => scoreFor(r, focusEntry.id) !== undefined)
      .length;
  }, [studentGrades, focusEntry, scoreFor]);

  const distributionData = useMemo(() => {
    if (!focusEntry) return [];
    const buckets: Record<string, number> = {
      "0-49": 0,
      "50-59": 0,
      "60-69": 0,
      "70-79": 0,
      "80-89": 0,
      "90-100": 0,
    };
    for (const row of studentGrades) {
      const score = scoreFor(row, focusEntry.id);
      if (score === undefined) continue;
      const pct = Math.round((score / (focusEntry.maxScore || 1)) * 100);
      if (pct < 50) buckets["0-49"] += 1;
      else if (pct < 60) buckets["50-59"] += 1;
      else if (pct < 70) buckets["60-69"] += 1;
      else if (pct < 80) buckets["70-79"] += 1;
      else if (pct < 90) buckets["80-89"] += 1;
      else buckets["90-100"] += 1;
    }
    return Object.entries(buckets).map(([label, count]) => ({ label, count }));
  }, [focusEntry, studentGrades, scoreFor]);

  const completionByAssignment = useMemo(
    () =>
      entries.map((entry) => {
        const total = studentGrades.length;
        const graded = studentGrades.filter(
          (row) => scoreFor(row, entry.id) !== undefined,
        ).length;
        return {
          label: entry.title,
          completion: total > 0 ? Math.round((graded / total) * 100) : 0,
        };
      }),
    [entries, studentGrades, scoreFor],
  );

  const handleGradeChange = (studentId: string, entryId: string, value: string) => {
    if (value.trim() === "") {
      setEditedGrades((prev) => {
        const forStudent = { ...(prev[studentId] || {}) };
        delete forStudent[entryId];
        return { ...prev, [studentId]: forStudent };
      });
      return;
    }
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setEditedGrades((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] || {}), [entryId]: numValue },
      }));
    }
  };

  const focusEntryAt = (index: number) => {
    const el = document.querySelector<HTMLElement>(`[${ENTRY_ATTR}="${index}"]`);
    if (!el) return false;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    return true;
  };

  const onEntryKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focusEntryAt(index + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusEntryAt(index - 1);
    }
  };

  const didAutoFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusEntry || studentGrades.length === 0) return;
    if (didAutoFocus.current === focusEntry.id) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    didAutoFocus.current = focusEntry.id;
    const first = studentGrades.findIndex(
      (r) => scoreFor(r, focusEntry.id) === undefined,
    );
    const target = first === -1 ? 0 : first;
    const id = window.requestAnimationFrame(() => focusEntryAt(target));
    return () => window.cancelAnimationFrame(id);
  }, [focusEntry, studentGrades, scoreFor]);

  const handleSave = async () => {
    if (!selectedCourseId) return;

    const promises = entries.map(async (entry) => {
      const scores: Array<{ studentId: string; score: number }> = [];
      for (const sg of studentGrades) {
        const editedScore = editedGrades[sg.studentId]?.[entry.id];
        const originalScore = sg.scores[entry.id];
        if (editedScore !== undefined) {
          scores.push({ studentId: sg.studentId, score: editedScore });
        } else if (originalScore !== undefined) {
          scores.push({ studentId: sg.studentId, score: originalScore });
        }
      }
      if (scores.length === 0) return;

      await saveScores({
        url: `grades/${entry.id}/scores`,
        method: "put",
        values: scores,
      });
    });

    await Promise.all(promises);
    setEditedGrades({});
    gradesQuery.refetch();
  };

  const dirtyCount = useMemo(
    () =>
      Object.values(editedGrades).reduce(
        (n, forStudent) => n + Object.keys(forStudent).length,
        0,
      ),
    [editedGrades],
  );

  const isLoading = coursesQuery.isLoading || gradesQuery.isLoading;

  if (isLoading && courses.length === 0) {
    return <PageSpinner label={t("teacher.loadingClasses")} />;
  }

  if (coursesQuery.isError) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={() => coursesQuery.refetch()}
        retryLabel={queryStrings.retry}
      />
    );
  }

  if (courses.length === 0) {
    return <EmptyState icon={GraduationCap} title={t("teacher.noClassesAssigned")} />;
  }

  const columns: ColumnDef<StudentGradeRow>[] = [
    {
      id: "student",
      header: () => <span>{t("teacher.student")}</span>,
      cell: ({ row }) => (
        <span className="font-semibold">{row.original.studentName}</span>
      ),
    },
    ...entries.map<ColumnDef<StudentGradeRow>>((e) => ({
      id: e.id,
      header: () => (
        <div className="text-center">
          <div>{e.title}</div>
          <div className="text-[11px] font-normal text-muted-foreground">
            {e.type} · /{e.maxScore} · {formatDate(e.date)}
          </div>
        </div>
      ),
      cell: ({ row }) => {
        const record = row.original;
        const originalScore = record.scores?.[e.id];
        const editedScore = editedGrades[record.studentId]?.[e.id];
        const activeScore = editedScore !== undefined ? editedScore : originalScore;
        const isEdited = editedScore !== undefined;

        if (e.gradeType === "letter") {
          return (
            <div className="flex flex-col items-center gap-0.5">
              <Select
                value={activeScore !== undefined ? String(activeScore) : ""}
                onValueChange={(val) => handleGradeChange(record.studentId, e.id, val)}
              >
                <SelectTrigger
                  size="sm"
                  className={cn("w-24", isEdited && "border-info ring-1 ring-info")}
                >
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {BAND_OPTIONS.map((b) => (
                    <SelectItem key={b.ordinal} value={String(b.ordinal)}>
                      {t(`gradeBands.${b.id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeScore === undefined ? (
                <div className="text-[11px] text-muted-foreground">
                  {t("teacher.notGraded")}
                </div>
              ) : null}
            </div>
          );
        }

        return (
          <div className="flex flex-col items-center gap-0.5">
            <Input
              value={activeScore ?? ""}
              placeholder="—"
              onChange={(ev) => handleGradeChange(record.studentId, e.id, ev.target.value)}
              className={cn(
                "h-8 w-16 text-center",
                isEdited && "border-info bg-info/10",
              )}
            />
            <div className="text-[11px] text-muted-foreground">
              {activeScore !== undefined
                ? formatPercent(percentOf(activeScore, e.maxScore))
                : t("teacher.notGraded")}
            </div>
          </div>
        );
      },
    })),
    {
      id: "avg",
      header: () => <span>{t("teacher.avg")}</span>,
      cell: ({ row }) => {
        const record = row.original;
        let totalScore = 0;
        let totalMax = 0;
        entries.forEach((entry) => {
          const activeScore = scoreFor(record, entry.id);
          if (activeScore === undefined) return;
          totalScore += activeScore;
          totalMax += entry.maxScore;
        });
        if (totalMax === 0) {
          return <span className="text-muted-foreground">{t("teacher.notGraded")}</span>;
        }
        const avg = percentOf(totalScore, totalMax);
        const band = bandForPercent(avg);
        return (
          <StatusBadge tone={band.tone}>
            {formatPercent(avg)} · {t(`gradeBands.${band.id}`)}
          </StatusBadge>
        );
      },
    },
  ];

  const entryRow = (row: StudentGradeRow, index: number) => {
    if (!focusEntry) return null;
    const active = scoreFor(row, focusEntry.id);
    const isEdited = editedGrades[row.studentId]?.[focusEntry.id] !== undefined;

    return (
      <div
        key={row.studentId}
        className="flex items-center justify-between gap-3 px-4 py-2.5"
      >
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {row.studentName}
        </span>
        {focusEntry.gradeType === "letter" ? (
          <Select
            value={active !== undefined ? String(active) : ""}
            onValueChange={(val) => {
              handleGradeChange(row.studentId, focusEntry.id, val);
              window.requestAnimationFrame(() => focusEntryAt(index + 1));
            }}
          >
            <SelectTrigger
              size="sm"
              {...{ [ENTRY_ATTR]: index }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") return;
              }}
              className={cn("w-28 shrink-0", isEdited && "border-info ring-1 ring-info")}
            >
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {BAND_OPTIONS.map((b) => (
                <SelectItem key={b.ordinal} value={String(b.ordinal)}>
                  {t(`gradeBands.${b.id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="flex shrink-0 items-center gap-2">
            <Input
              {...{ [ENTRY_ATTR]: index }}
              value={active ?? ""}
              placeholder="—"
              inputMode="decimal"
              step="any"
              aria-label={row.studentName}
              onChange={(ev) =>
                handleGradeChange(row.studentId, focusEntry.id, ev.target.value)
              }
              onKeyDown={(e) => onEntryKeyDown(e, index)}
              className={cn(
                "h-10 w-20 text-center text-base",
                isEdited && "border-info bg-info/10",
              )}
            />
            <span className="w-16 text-xs text-muted-foreground" dir="ltr">
              {active !== undefined
                ? formatPercent(percentOf(active, focusEntry.maxScore))
                : `/ ${focusEntry.maxScore}`}
            </span>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 pb-24">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">{t("teacher.course")}</span>
          <Select
            value={selectedCourseId ?? ""}
            onValueChange={(val) => {
              setSelectedCourseId(val);
              setEditedGrades({});
            }}
          >
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title || [c.subject, c.gradeTag].filter(Boolean).join(" — ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("nav.gradebook")}</CardTitle>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              disabled={!selectedCourseId}
            >
              <Plus className="size-4" />
              {t("teacher.createAssignment")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          <QuerySection
            query={combineQueries(gradesQuery, enrollmentsQuery)}
            skeleton={<PageSpinner />}
            className="mx-6"
          >
          {entries.length === 0 ? (
            <div className="px-6">
              <EmptyState title={t("teacher.noGradeEntries")} />
            </div>
          ) : studentGrades.length === 0 ? (
            <div className="px-6">
              <EmptyState title={t("teacher.noStudentsEnrolled")} />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 px-6">
                <span className="text-sm font-semibold">
                  {t("teacher.assessment")}
                </span>
                <Select
                  value={selectedEntryId ?? ""}
                  onValueChange={(val) => setSelectedEntryId(val)}
                >
                  <SelectTrigger className="min-w-56 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {entriesByRecency.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {focusEntry ? (
                <p className="px-6 text-xs text-muted-foreground">
                  {formatDate(focusEntry.date)}
                  {focusEntry.gradeType === "numeric" ? (
                    <>
                      {" · "}
                      <span dir="ltr">/ {focusEntry.maxScore}</span>
                    </>
                  ) : null}
                </p>
              ) : null}

              <p className="px-6 text-xs text-muted-foreground">
                {t("teacher.gradedOfTotal", {
                  graded: gradedCount,
                  total: studentGrades.length,
                })}
                <span className="hidden sm:inline">
                  {" · "}
                  {t("teacher.entryHint")}
                </span>
              </p>

              <div className="divide-y divide-border border-y border-border">
                {studentGrades.map((row, i) => entryRow(row, i))}
              </div>
            </>
          )}
          </QuerySection>
        </CardContent>
      </Card>

      {entries.length > 0 && studentGrades.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("teacher.allAssessments")}</CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMatrix((v) => !v)}
                aria-expanded={showMatrix}
              >
                <ChevronDown
                  className={cn("size-4 transition-transform", showMatrix && "rotate-180")}
                />
                {showMatrix ? t("teacher.hide") : t("teacher.show")}
              </Button>
            </CardAction>
          </CardHeader>
          {showMatrix ? (
            <CardContent>
              <DataTable
                columns={columns}
                data={studentGrades}
                pageSize={9999}
                emptyState={t("teacher.noStudentsEnrolled")}
              />
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {entries.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("teacher.analysis")}</CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAnalysis((v) => !v)}
                aria-expanded={showAnalysis}
              >
                <ChevronDown
                  className={cn("size-4 transition-transform", showAnalysis && "rotate-180")}
                />
                {showAnalysis ? t("teacher.hide") : t("teacher.show")}
              </Button>
            </CardAction>
          </CardHeader>
          {showAnalysis ? (
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">
                  {t("teacher.scoreDistribution")}
                  {focusEntry ? ` — ${focusEntry.title}` : ""}
                </p>
                <BarChart
                  data={distributionData}
                  series={[{ key: "count", label: t("teacher.scores"), color: "var(--primary)" }]}
                  emptyText={t("teacher.noDistribution")}
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">
                  {t("teacher.completionByAssignment")}
                </p>
                <BarChart
                  data={completionByAssignment}
                  series={[{ key: "completion", label: t("teacher.completionPct"), color: "var(--success)" }]}
                  horizontal
                  yValueFormatter={(value) => formatPercent(Math.round(value))}
                  emptyText={t("teacher.noCompletion")}
                />
              </div>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {dirtyCount > 0 ? (
        <div className="fixed inset-x-0 bottom-16 z-30 mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:bottom-4 sm:rounded-xl sm:border">
          <span className="text-sm font-medium">
            {t("teacher.unsavedCount", { n: dirtyCount })}
          </span>
          <span className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditedGrades({})}>
              {t("teacher.discard")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Spinner /> : <Save className="size-4" />}
              {t("teacher.saveGrades")}
            </Button>
          </span>
        </div>
      ) : null}

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) createForm.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("teacher.createModalTitle")}</DialogTitle>
          </DialogHeader>
          <Form {...createForm}>
            <form
              noValidate
              onSubmit={createForm.handleSubmit(handleCreate)}
              autoComplete="off"
              className="space-y-4"
            >
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("teacher.assignmentName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("teacher.assignmentNamePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="gradeType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("teacher.gradeType")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="numeric">{t("teacher.gradeTypeNumeric")}</SelectItem>
                        <SelectItem value="letter">{t("teacher.gradeTypeLetter")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchedGradeType !== "letter" && (
                <FormField
                  control={createForm.control}
                  name="maxScore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("teacher.maxScore")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step="any"
                          inputMode="decimal"
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.valueAsNumber;
                            field.onChange(
                              e.target.value === "" || Number.isNaN(v) ? undefined : v,
                            );
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={createForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("teacher.date")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateOpen(false);
                    createForm.reset();
                  }}
                >
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Spinner /> : null}
                  {t("teacher.create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
