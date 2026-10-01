import { bandForPercent, percentOf, type GradeBand } from "@repo/shared/grading-scale";

export type GradeRow = {
  id: string;
  name?: string;
  courseId: string;
  courseName?: string;
  subject?: string;
  date?: string | null;
  maxScore: number;
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
  label: string;
  percent: number;
  band: GradeBand;
  totalScore: number;
  totalMax: number;
  entries: GradeEntry[];
};

export function myScore(row: GradeRow): number | null {
  const first = row.scores?.[0];
  return first ? first.score : null;
}

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

export function bestSubject(groups: SubjectGrades[]): SubjectGrades | null {
  return groups.reduce<SubjectGrades | null>(
    (acc, g) => (!acc || g.percent > acc.percent ? g : acc),
    null,
  );
}

export function countEntries(groups: SubjectGrades[]): number {
  return groups.reduce((n, g) => n + g.entries.length, 0);
}
