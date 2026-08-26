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
import { cn } from "@repo/ui/lib/utils";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { BarChart } from "@/components/charts";
import { GRADE_BANDS, bandForPercent, percentOf } from "@repo/database/grading-scale";

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

/** Focus target for the entry list — one per student row, in display order. */
const ENTRY_ATTR = "data-grade-entry";

export function TeacherGradebookScreen() {
  const t = useTranslations();
  const { formatDate, formatPercent } = useFormatters();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  // The teacher portal has no student record page, so a student found in the
  // global palette opens the gradebook of the group they are in.
  useParamSeed("courseId", setSelectedCourseId);
  /* ONE SELECTED ASSESSMENT, not two.
     This used to be `selectedDistributionEntryId`, steering the chart only,
     while the grid showed every assessment at once. The entry list and the
     distribution now read the SAME selection: a teacher marking an exam and a
     teacher looking at how that exam went are the same person, on the same
     exam, and two independent pickers for one question is how the two drift. */
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

  /* NEWEST FIRST IN THE PICKER, because the exam a teacher has just finished
     marking on paper is the one they came here to enter. The matrix below
     keeps the payload's own order, so the overview does not reshuffle. */
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
      !entriesByRecency.some((entry) => entry._id === selectedEntryId)
    ) {
      setSelectedEntryId(entriesByRecency[0]._id);
    }
  }, [entriesByRecency, selectedEntryId]);

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

  const focusEntry = useMemo(
    () => entries.find((e) => e._id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  );

  /** The active value for one student on one assessment — edit wins over saved. */
  const scoreFor = useCallback(
    (row: StudentGradeRow, entryId: string): number | undefined => {
      const edited = editedGrades[row.studentId]?.[entryId];
      return edited !== undefined ? edited : row.scores?.[entryId];
    },
    [editedGrades],
  );

  const gradedCount = useMemo(() => {
    if (!focusEntry) return 0;
    return studentGrades.filter((r) => scoreFor(r, focusEntry._id) !== undefined)
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
      const score = scoreFor(row, focusEntry._id);
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
          (row) => scoreFor(row, entry._id) !== undefined,
        ).length;
        return {
          label: entry.title,
          completion: total > 0 ? Math.round((graded / total) * 100) : 0,
        };
      }),
    [entries, studentGrades, scoreFor],
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

  /* ── THE KEYBOARD PATH ────────────────────────────────────────────────────
     Entering one exam's marks for thirty students is the teacher's highest-
     volume task, and the matrix made it a diagonal walk: Tab moved along the
     ROW, to the next assessment, while the marker's actual path is down one
     COLUMN. There was no key for that, so it was thirty pointer trips.

     Enter and ↓ now go to the next student on the same assessment, ↑ goes
     back. Nothing here commits: saving is still the explicit button, because a
     roster of marks is reviewed before it is published to families. */
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

  /* Land the cursor on the first UNMARKED student when the assessment changes.
     Only where a keyboard is the input device: on a touch screen an autofocus
     throws the on-screen keyboard up over the list before the teacher has
     chosen what to do, which is a worse start than one tap. */
  const didAutoFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusEntry || studentGrades.length === 0) return;
    if (didAutoFocus.current === focusEntry._id) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    didAutoFocus.current = focusEntry._id;
    const first = studentGrades.findIndex(
      (r) => scoreFor(r, focusEntry._id) === undefined,
    );
    const target = first === -1 ? 0 : first;
    // After paint: the list for this assessment has to exist to be focused.
    const id = window.requestAnimationFrame(() => focusEntryAt(target));
    return () => window.cancelAnimationFrame(id);
  }, [focusEntry, studentGrades, scoreFor]);

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
          const activeScore = scoreFor(record, entry._id);
          // Only GRADED assessments count. Averaging an unmarked exam as zero
          // drags a student's average down for work nobody has corrected yet.
          if (activeScore === undefined) return;
          totalScore += activeScore;
          totalMax += entry.maxScore;
        });
        if (totalMax === 0) {
          return <span className="text-muted-foreground">{t("teacher.notGraded")}</span>;
        }
        // THE LADDER IS `@repo/database/grading-scale`, NOT A LOCAL ONE.
        // This cell carried its own cut-offs — `>=90 success : >=75 info :
        // warning` — against the shared ladder's 85 / 75 / 65 / 50. Two
        // consequences, both real: a student at 87% read ممتاز on their own
        // screen and the "very good" tone on their teacher's, and the local
        // ladder had NO failing band at all, so a child at 30% and a child at
        // 70% were the same amber to the teacher while the family saw ضعيف and
        // مقبول. That is the exact drift grading-scale.ts was written to end
        // (its header names the parent screen's missing failing band); the
        // gradebook was simply left behind when the other three converted.
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

  /** One student, one mark — the row the whole screen is now built around. */
  const entryRow = (row: StudentGradeRow, index: number) => {
    if (!focusEntry) return null;
    const active = scoreFor(row, focusEntry._id);
    const isEdited = editedGrades[row.studentId]?.[focusEntry._id] !== undefined;

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
              handleGradeChange(row.studentId, focusEntry._id, val);
              // A تقدير is chosen, not typed, so there is no Enter to advance
              // on — move to the next student when the value lands.
              window.requestAnimationFrame(() => focusEntryAt(index + 1));
            }}
          >
            <SelectTrigger
              size="sm"
              {...{ [ENTRY_ATTR]: index }}
              onKeyDown={(e) => {
                // Leave Radix its own keys; only the vertical walk is ours.
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
              /* `step="any"`: the max score may be 12.5, and a step the value
                 disagrees with blocks a submit with nothing shown — the trap
                 already recorded on this screen's create dialog. */
              step="any"
              aria-label={row.studentName}
              onChange={(ev) =>
                handleGradeChange(row.studentId, focusEntry._id, ev.target.value)
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

      {/* ENTRY FIRST. The screen used to open with two charts — roughly 600px
          of analysis above the inputs the teacher came to fill in. The marks
          are the job; the charts are what you read once the job is done. */}
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
                      <SelectItem key={entry._id} value={entry._id}>
                        {entry.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* The date and the total live HERE, not inside the trigger.
                  Measured at 375px: "title · 28 يوليو 2026" overflowed the
                  trigger and the clipped year rendered as "026!" — a bidi
                  artefact of cutting a Latin numeral inside Arabic text. A
                  caption cannot clip, and it has room to carry the mark out of
                  which every row below is scored. */}
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
                {/* The Enter hint is for the device that HAS an Enter key.
                    On a phone the marker taps each field, and promising a key
                    the on-screen keyboard labels "Go" is a small lie in the
                    one line that is supposed to teach the shortcut. */}
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
        </CardContent>
      </Card>

      {/* The full matrix stays — it is the right shape for "how is this group
          doing across everything", which is a reading task, not an entry one.
          Collapsed by default, and never the first thing on a phone. */}
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

      {/* THE SAVE BAR FOLLOWS THE WORK DOWN THE PAGE.
          It used to sit in the card header — above a grid the teacher had just
          scrolled to the bottom of — so committing thirty marks meant scrolling
          back up to find the button. It appears only when there is something to
          save, so it costs an untouched screen nothing. */}
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
            {/* `noValidate` — zod is the only validator, in Arabic, under the
                field. */}
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
                          /* The schema is `z.number().min(1)` — it allows
                             12.5. The default `step` is 1, which does not, and
                             a step the schema disagrees with blocks the submit
                             with nothing shown. */
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
