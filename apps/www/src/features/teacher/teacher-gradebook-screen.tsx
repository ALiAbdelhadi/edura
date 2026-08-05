"use client";

import { useState, useEffect, useMemo } from "react";
import { useList, useCustomMutation, useCreate } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Plus, GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
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
import { cn } from "@repo/ui/lib/utils";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { BarChart } from "@/components/charts";
import { GRADE_BANDS } from "@repo/database/grading-scale";

interface RawGrade {
  id: string;
  courseId: string;
  name: string;
  gradeType?: "numeric" | "letter";
  maxScore: number;
  date: string;
  scores: Array<{ studentId: string; score: number }>;
}

/*
 * A تقدير assessment stores 0–4 in `grades.score` with `maxScore: 4`. That
 * has NOT changed — this is the same five buckets, named the way an Egyptian
 * teacher and parent name them (ممتاز … ضعيف) instead of A–F. `GRADE_BANDS`
 * carries the ordinal, so the picker is generated FROM the ladder rather than
 * repeating it, and no stored row changes meaning.
 */
const BAND_OPTIONS = [...GRADE_BANDS].sort((a, b) => b.ordinal - a.ordinal);

interface RawStudent {
  _id: string;
  name: string;
}

interface GradeEntry {
  _id: string;
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

export function TeacherGradebookScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedDistributionEntryId, setSelectedDistributionEntryId] = useState<string | null>(null);
  const [editedGrades, setEditedGrades] = useState<Record<string, Record<string, number>>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);

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
  });
  const courses = (coursesResult?.data ?? []) as any[];

  const { query: gradesQuery, result: gradesResult } = useList({
    resource: "grades",
    filters: selectedCourseId
      ? [{ field: "courseId", operator: "eq" as const, value: selectedCourseId }]
      : [],
    pagination: { mode: "off" },
    queryOptions: { enabled: !!selectedCourseId },
  });
  const rawGrades = (gradesResult?.data ?? []) as unknown as RawGrade[];

  const { result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: selectedCourseId
      ? [{ field: "courseId", operator: "eq" as const, value: selectedCourseId }]
      : [],
    pagination: { mode: "off" },
    queryOptions: { enabled: !!selectedCourseId },
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
          gradesQuery.refetch();
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
        _id: g.id,
        title: g.name,
        type: "exam",
        gradeType: g.gradeType || "numeric",
        maxScore: g.maxScore,
        date: g.date,
      })),
    [rawGrades],
  );

  useEffect(() => {
    if (entries.length === 0) {
      setSelectedDistributionEntryId(null);
      return;
    }
    if (
      !selectedDistributionEntryId ||
      !entries.some((entry) => entry._id === selectedDistributionEntryId)
    ) {
      setSelectedDistributionEntryId(entries[0]._id);
    }
  }, [entries, selectedDistributionEntryId]);

  const studentGrades: StudentGradeRow[] = useMemo(() => {
    const studentMap = new Map<string, StudentGradeRow>();
    // Every enrolled student gets a row up front — a fresh assessment has no
    // score rows yet, and without the roster there is no way to enter the
    // first grade at all.
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

  const distributionData = useMemo(() => {
    const selectedEntry = entries.find((entry) => entry._id === selectedDistributionEntryId);
    if (!selectedEntry) return [];
    const buckets: Record<string, number> = {
      "0-49": 0,
      "50-59": 0,
      "60-69": 0,
      "70-79": 0,
      "80-89": 0,
      "90-100": 0,
    };
    for (const row of studentGrades) {
      const score = editedGrades[row.studentId]?.[selectedEntry._id] ?? row.scores?.[selectedEntry._id];
      if (score === undefined) continue;
      const pct = Math.round((score / (selectedEntry.maxScore || 1)) * 100);
      if (pct < 50) buckets["0-49"] += 1;
      else if (pct < 60) buckets["50-59"] += 1;
      else if (pct < 70) buckets["60-69"] += 1;
      else if (pct < 80) buckets["70-79"] += 1;
      else if (pct < 90) buckets["80-89"] += 1;
      else buckets["90-100"] += 1;
    }
    return Object.entries(buckets).map(([label, count]) => ({ label, count }));
  }, [entries, selectedDistributionEntryId, studentGrades, editedGrades]);

  const completionByAssignment = useMemo(
    () =>
      entries.map((entry) => {
        const total = studentGrades.length;
        const graded = studentGrades.filter((row) => {
          const score = editedGrades[row.studentId]?.[entry._id] ?? row.scores?.[entry._id];
          return score !== undefined;
        }).length;
        return {
          label: entry.title,
          completion: total > 0 ? Math.round((graded / total) * 100) : 0,
        };
      }),
    [entries, studentGrades, editedGrades],
  );

  const handleGradeChange = (studentId: string, entryId: string, value: string) => {
    // Emptying the box drops the PENDING edit (back to the saved score, or to
    // ungraded). Without this the field is controlled by state that never
    // changes on an empty string, so the old number snaps back and the teacher
    // cannot correct a typo. Deleting a SAVED grade is not offered — the
    // scores endpoint replaces values, it has no delete.
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

  const handleSave = async () => {
    if (!selectedCourseId) return;

    const promises = entries.map(async (entry) => {
      const scores: Array<{ studentId: string; score: number }> = [];
      for (const sg of studentGrades) {
        const editedScore = editedGrades[sg.studentId]?.[entry._id];
        const originalScore = sg.scores[entry._id];
        if (editedScore !== undefined) {
          scores.push({ studentId: sg.studentId, score: editedScore });
        } else if (originalScore !== undefined) {
          scores.push({ studentId: sg.studentId, score: originalScore });
        }
      }
      if (scores.length === 0) return;

      await saveScores({
        url: `grades/${entry._id}/scores`,
        method: "put",
        values: scores,
      });
    });

    await Promise.all(promises);
    setEditedGrades({});
    gradesQuery.refetch();
  };

  const isLoading = coursesQuery.isLoading || gradesQuery.isLoading;

  if (isLoading && courses.length === 0) {
    return <PageSpinner label={t("teacher.loadingClasses")} />;
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
      id: e._id,
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
        // NOT `|| 0`. An ungraded student is ungraded — printing a 0 (or, on a
        // تقدير assessment, the lowest band) states something false about a
        // child. It stayed invisible while only already-scored students had
        // rows; now that the roster carries every enrolled student, an empty
        // cell is the only honest rendering.
        const originalScore = record.scores?.[e._id];
        const editedScore = editedGrades[record.studentId]?.[e._id];
        const activeScore = editedScore !== undefined ? editedScore : originalScore;
        const isEdited = editedScore !== undefined;

        if (e.gradeType === "letter") {
          return (
            <div className="flex flex-col items-center gap-0.5">
              <Select
                value={activeScore !== undefined ? String(activeScore) : ""}
                onValueChange={(val) => handleGradeChange(record.studentId, e._id, val)}
              >
                {/* w-24, not the w-16 this was while the options were "A"…"F":
                    a تقدير is a word, and "جيد جدًا" clipped to "جيـ" in the
                    trigger. Sized to the longest band, not to the current one. */}
                <SelectTrigger
                  size="sm"
                  className={cn("w-24", isEdited && "border-info ring-1 ring-info")}
                >
                  {/* An em-dash, not the words — "غير مرصودة" is longer than
                      the longest band and clipped inside this trigger. The
                      words go in the caption below, exactly as the numeric
                      branch does it. */}
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
              {/* No caption once a تقدير IS picked: the trigger already carries
                  the word, and captioning it printed the same word twice (it
                  did with the letters too). Ungraded is the one case the
                  trigger cannot say by itself — a bare dash is not an answer. */}
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
              onChange={(ev) => handleGradeChange(record.studentId, e._id, ev.target.value)}
              className={cn(
                "h-8 w-16 text-center",
                isEdited && "border-info bg-info/10",
              )}
            />
            <div className="text-[11px] text-muted-foreground">
              {activeScore !== undefined
                ? `${Math.round((activeScore / e.maxScore) * 100)}%`
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
          const originalScore = record.scores?.[entry._id];
          const editedScore = editedGrades[record.studentId]?.[entry._id];
          const activeScore = editedScore !== undefined ? editedScore : originalScore;
          // Only GRADED assessments count. Averaging an unmarked exam as zero
          // drags a student's average down for work nobody has corrected yet.
          if (activeScore === undefined) return;
          totalScore += activeScore;
          totalMax += entry.maxScore;
        });
        if (totalMax === 0) {
          return <span className="text-muted-foreground">{t("teacher.notGraded")}</span>;
        }
        const avg = Math.round((totalScore / totalMax) * 100);
        const tone = avg >= 90 ? "success" : avg >= 75 ? "info" : "warning";
        return <StatusBadge tone={tone}>{avg}%</StatusBadge>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">{t("teacher.course")}</span>
          {/* `?? ""`, never `?? undefined`: the id is null on first paint, and
              an undefined value makes the Select uncontrolled for one render,
              then controlled — React warns, and the picker can drop the first
              selection. */}
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
          <CardAction className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              disabled={!selectedCourseId}
            >
              <Plus className="size-4" />
              {t("teacher.createAssignment")}
            </Button>
            {Object.keys(editedGrades).length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setEditedGrades({})}>
                {t("teacher.discard")}
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending || Object.keys(editedGrades).length === 0}
            >
              {saveMutation.isPending ? <Spinner /> : <Save className="size-4" />}
              {t("teacher.saveGrades")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("teacher.scoreDistribution")}</CardTitle>
                <CardAction className="self-center">
                  <Select
                    value={selectedDistributionEntryId ?? ""}
                    onValueChange={setSelectedDistributionEntryId}
                  >
                    <SelectTrigger size="sm" className="min-w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {entries.map((entry) => (
                        <SelectItem key={entry._id} value={entry._id}>
                          {entry.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardAction>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={distributionData}
                  series={[{ key: "count", label: t("teacher.scores"), color: "var(--primary)" }]}
                  emptyText={t("teacher.noDistribution")}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("teacher.completionByAssignment")}</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={completionByAssignment}
                  series={[{ key: "completion", label: t("teacher.completionPct"), color: "var(--success)" }]}
                  horizontal
                  yValueFormatter={(value) => `${Math.round(value)}%`}
                  emptyText={t("teacher.noCompletion")}
                />
              </CardContent>
            </Card>
          </div>

          {entries.length === 0 ? (
            <EmptyState title={t("teacher.noGradeEntries")} />
          ) : studentGrades.length === 0 ? (
            <EmptyState title={t("teacher.noStudentsEnrolled")} />
          ) : (
            <DataTable
              columns={columns}
              data={studentGrades}
              pageSize={9999}
              emptyState={t("teacher.noStudentsEnrolled")}
            />
          )}
        </CardContent>
      </Card>

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
