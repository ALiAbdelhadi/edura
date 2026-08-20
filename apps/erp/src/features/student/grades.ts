/**
 * ONE reading of the gradebook, shared by the home card and the grades page.
 *
 * ── WHAT THE PRODUCT COULD NOT SHOW ───────────────────────────────────────
 *
 * "جبت كام في الامتحان؟" is the second question this portal exists to answer,
 * and until now nothing answered it. The home printed an AVERAGE across
 * subjects; the grades page printed a per-subject total. The individual exam —
 * the thing a 16-year-old actually asks about, by name — was aggregated away on
 * both screens even though every field needed to show it was already on the
 * wire: `GET /api/v1/grades` returns each grade's `name`, `date`, `maxScore`
 * and the student's own `scores`, enriched with `courseName` and `subject`.
 *
 * ── THE SCALE IS NOT DECIDED HERE ─────────────────────────────────────────
 *
 * `@repo/database/grading-scale` owns the ladder and the percentage rule.
 * Egyptian K-12 reports المجموع ÷ المجموع الكلي — the marks summed, then
 * divided — NOT the mean of each assessment's own percentage, which is the
 * difference between a 50-mark final counting as a final and counting as one
 * quiz. That rule lives in `percentOf`; this module only groups rows.
 */

import { bandForPercent, percentOf, type GradeBand } from "@repo/database/grading-scale";

export type GradeRow = {
  id: string;
  name?: string;
  courseId: string;
  courseName?: string;
  subject?: string;
  date?: string | null;
  maxScore: number;
  /** The endpoint filters this to the reader's own score for a student. */
  scores?: { score: number }[];
};

export type GradeEntry = {
  id: string;
  name: string;
  date: string | null;
  score: number;
  maxScore: number;
  percent: number;
  band: GradeBand;
};

export type SubjectGrades = {
  courseId: string;
  /** The subject where the catalogue knows one, otherwise the course title. */
  label: string;
  percent: number;
  band: GradeBand;
  totalScore: number;
  totalMax: number;
  entries: GradeEntry[];
};

/** The reader's own mark on a grade, or null when it has not been entered. */
export function myScore(row: GradeRow): number | null {
  const first = row.scores?.[0];
  return first ? first.score : null;
}

/** Newest first. A grade with no date sorts last rather than being dropped. */
function byDateDesc(a: GradeEntry, b: GradeEntry): number {
  if (!a.date) return 1;
  if (!b.date) return -1;
  return b.date.localeCompare(a.date);
}

function toEntry(row: GradeRow, score: number): GradeEntry {
  const percent = percentOf(score, row.maxScore);
  return {
    id: row.id,
    name: row.name?.trim() || "",
    date: row.date ?? null,
    score,
    maxScore: row.maxScore,
    percent,
    band: bandForPercent(percent),
  };
}

/**
 * The rows grouped by course, each carrying the entries behind its figure.
 *
 * A grade the student has no score on is EXCLUDED — from the entries and from
 * the totals alike. It is an assessment that has not been marked yet, and
 * counting an unmarked exam as a zero would invent a failure. (This is also the
 * data the removed "assignments" screen used to read as a pending/graded
 * status; there is no Assignment model, and it must not be reinstated.)
 */
export function gradesBySubject(rows: GradeRow[]): SubjectGrades[] {
  const map = new Map<string, SubjectGrades>();

  for (const row of rows) {
    const score = myScore(row);
    if (score === null) continue;

    let group = map.get(row.courseId);
    if (!group) {
      group = {
        courseId: row.courseId,
        label: row.subject?.trim() || row.courseName?.trim() || row.courseId,
        percent: 0,
        band: bandForPercent(0),
        totalScore: 0,
        totalMax: 0,
        entries: [],
      };
      map.set(row.courseId, group);
    }

    group.entries.push(toEntry(row, score));
    group.totalScore += score;
    group.totalMax += row.maxScore;
  }

  const out = [...map.values()];
  for (const group of out) {
    group.percent = percentOf(group.totalScore, group.totalMax);
    group.band = bandForPercent(group.percent);
    group.entries.sort(byDateDesc);
  }
  return out;
}

/** The single newest marked entry, with the subject it belongs to. */
export function latestGrade(
  rows: GradeRow[],
): { entry: GradeEntry; label: string } | null {
  let best: { entry: GradeEntry; label: string } | null = null;

  for (const row of rows) {
    const score = myScore(row);
    if (score === null) continue;
    const entry = toEntry(row, score);
    if (!best || byDateDesc(entry, best.entry) < 0) {
      best = { entry, label: row.subject?.trim() || row.courseName?.trim() || "" };
    }
  }
  return best;
}

/** The strongest subject, or null before anything is marked. */
export function bestSubject(groups: SubjectGrades[]): SubjectGrades | null {
  return groups.reduce<SubjectGrades | null>(
    (acc, g) => (!acc || g.percent > acc.percent ? g : acc),
    null,
  );
}

/** Total marked entries across every subject — the lineage for the averages. */
export function countEntries(groups: SubjectGrades[]): number {
  return groups.reduce((n, g) => n + g.entries.length, 0);
}
