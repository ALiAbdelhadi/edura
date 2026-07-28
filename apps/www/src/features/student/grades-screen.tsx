"use client";

import { useList } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSpinner } from "@/components/kit/spinner";
import {
  Chip,
  Eyebrow,
  InitialsTile,
  LedgerEmpty,
  LedgerTable,
  Num,
  PageTitle,
  SectionHeading,
  Sheet,
  Td,
  Th,
  Tr,
} from "@/features/student/ledger";

type GradeRow = {
  courseId: string;
  courseName?: string;
  subject?: string;
  maxScore: number;
  scores?: { score: number }[];
};
type CourseRow = { id?: string; _id?: string; title?: string; subject?: string };

/**
 * Grades — the record, with the entries behind each figure.
 *
 * NOTE ON THE SCALE: `percentageToGrade` emits a US letter scale, duplicated
 * from api/v1/dashboards/student/route.ts, and the old screen also derived a
 * 4.0 GPA from it. Egyptian K-12 reports percentages. Changing the grading
 * vocabulary is a product decision affecting student, parent and teacher, so it
 * is filed in design/REQUESTS.md rather than decided here. The letter is kept,
 * but the percentage now carries the weight — it is the figure the entries
 * actually support. The GPA card is gone: a 4.0 average of letter buckets
 * derived from percentages is two lossy conversions away from the record.
 */
function percentageToGrade(pct: number): string {
  if (pct >= 97) return "A+";
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  if (pct >= 67) return "D+";
  if (pct >= 60) return "D";
  return "F";
}

export function GradesScreen() {
  const t = useTranslations();
  const { formatPercent } = useFormatters();
  const { query, result } = useList({ resource: "grades" });
  const { result: coursesResult } = useList({ resource: "courses", pagination: { pageSize: 100 } });

  const grades = (result?.data ?? []) as GradeRow[];
  const courses = (coursesResult?.data ?? []) as CourseRow[];

  const courseNameMap = new Map<string, string>();
  for (const c of courses) {
    const id = c._id || c.id;
    if (id) courseNameMap.set(id, c.title || c.subject || id);
  }

  const courseMap = new Map<
    string,
    { name: string; subject: string; scores: { score: number; max: number }[] }
  >();
  for (const g of grades) {
    if (!courseMap.has(g.courseId)) {
      courseMap.set(g.courseId, {
        name: courseNameMap.get(g.courseId) || g.courseName || g.courseId,
        subject: g.subject || "",
        scores: [],
      });
    }
    const myScore = g.scores?.[0];
    if (myScore) courseMap.get(g.courseId)!.scores.push({ score: myScore.score, max: g.maxScore });
  }

  const rows = Array.from(courseMap.entries()).map(([courseId, data]) => {
    const totalScore = data.scores.reduce((a, b) => a + b.score, 0);
    const totalMax = data.scores.reduce((a, b) => a + b.max, 0);
    const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    return {
      courseId,
      name: data.name,
      subject: data.subject,
      pct,
      grade: percentageToGrade(pct),
      entries: data.scores.length,
      totalScore,
      totalMax,
    };
  });

  const best = rows.reduce<(typeof rows)[0] | null>(
    (acc, r) => (!acc || r.pct > acc.pct ? r : acc),
    null,
  );
  const gradedEntries = rows.reduce((a, r) => a + r.entries, 0);

  if (query.isLoading) return <PageSpinner label={t("common.loading")} />;

  return (
    <div className="space-y-6">
      <PageTitle title={t("nav.grades")} subtitle={t("studentClass.gradesSubtitle")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Sheet className="p-5">
          <Eyebrow>{t("studentClass.subjects")}</Eyebrow>
          <Num style={{ fontSize: 30, fontWeight: 600, color: "var(--ink)" }}>
            {courseMap.size}
          </Num>
        </Sheet>
        <Sheet className="p-5">
          <Eyebrow>{t("studentClass.entries")}</Eyebrow>
          <Num style={{ fontSize: 30, fontWeight: 600, color: "var(--ink)" }}>{gradedEntries}</Num>
        </Sheet>
        <Sheet className="p-5">
          <Eyebrow>{t("studentClass.highestGrade")}</Eyebrow>
          <Num style={{ fontSize: 30, fontWeight: 600, color: "var(--ink)" }}>
            {best ? `${best.pct}%` : "—"}
          </Num>
          {best ? (
            <p className="mt-1 truncate text-xs" style={{ color: "var(--ink-3)" }}>
              {best.subject || best.name}
            </p>
          ) : null}
        </Sheet>
      </div>

      <Sheet className="p-5">
        <SectionHeading title={t("studentClass.gradesTitle")} />
        <div className="mt-3">
          {rows.length === 0 ? (
            <LedgerEmpty title={t("studentClass.noGrades")} />
          ) : (
            <LedgerTable
              head={
                <>
                  <Th>{t("studentClass.subject")}</Th>
                  <Th align="end">{t("studentClass.entries")}</Th>
                  <Th align="end">{t("studentClass.score")}</Th>
                  <Th align="end">{t("studentClass.grade")}</Th>
                </>
              }
            >
              {rows.map((r) => (
                <Tr key={r.courseId}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <InitialsTile name={r.subject || r.name || "?"} size={30} tone="teal" />
                      <span className="font-medium" style={{ color: "var(--ink)" }}>
                        {r.subject || r.name}
                      </span>
                    </div>
                  </Td>
                  <Td align="end">
                    {/* The entry count IS the lineage for the percentage beside
                        it — a score with no entry count behind it is a figure
                        the student has to take on trust. */}
                    <Num style={{ color: "var(--ink-2)", fontSize: 13 }}>{r.entries}</Num>
                  </Td>
                  <Td align="end">
                    <Num style={{ color: "var(--ink)", fontWeight: 600 }}>
                      {formatPercent(r.pct)}
                    </Num>
                    <div>
                      <Num style={{ color: "var(--ink-3)", fontSize: 11 }}>
                        {r.totalScore}/{r.totalMax}
                      </Num>
                    </div>
                  </Td>
                  <Td align="end">
                    <Chip tone={r.pct >= 85 ? "teal" : r.pct >= 60 ? "indigo" : "amber"}>
                      {r.grade}
                    </Chip>
                  </Td>
                </Tr>
              ))}
            </LedgerTable>
          )}
        </div>
      </Sheet>
    </div>
  );
}
