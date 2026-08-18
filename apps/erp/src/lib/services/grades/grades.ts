import { scopedDb } from "@/lib/db/scope";
import type { SessionUser as AuthUser } from "@/lib/auth/session";
import type { TenantTx } from "@/lib/db/scope";
import { notify } from "@/lib/services/notifications/notify";
import { studentAndParents } from "@/lib/services/notifications/fanout";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "@/lib/errors/classes";

type GradeType = "numeric" | "letter";

type SessionUser = { id: string; role: string; centerId?: string };

function asAuthUser(user: SessionUser): AuthUser {
  return user as unknown as AuthUser;
}

const LETTER_TO_NUMERIC: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
const NUMERIC_TO_LETTER: Record<number, string> = { 4: "A", 3: "B", 2: "C", 1: "D", 0: "F" };
const VALID_LETTERS = new Set(Object.keys(LETTER_TO_NUMERIC));

export function letterToNumeric(letter: string): number {
  const val = LETTER_TO_NUMERIC[letter.toUpperCase()];
  if (val === undefined) throw new BusinessRuleError(`Invalid letter grade: ${letter}`);
  return val;
}

export function numericToLetter(num: number): string {
  return NUMERIC_TO_LETTER[num] ?? String(num);
}

async function assertParentLink(tx: TenantTx, parentId: string, studentId: string) {
  const link = await tx.parentStudentLink.findFirst({
    where: { parentId, studentId, status: "approved" },
  });
  if (!link) throw new ForbiddenError("Not linked to this student");
}

async function getCourseAndVerifyTeacher(tx: TenantTx, courseId: string, teacherId: string) {
  const course = await tx.course.findUnique({ where: { id: courseId } });
  if (!course) throw new NotFoundError("Course not found");
  if (course.teacherId !== teacherId)
    throw new ForbiddenError("Only the assigned teacher can manage grades for this course");
  return course;
}

export async function createGrade(
  data: { courseId: string; name: string; maxScore: number; date: string; gradeType?: GradeType },
  user: SessionUser,
) {
  return scopedDb(asAuthUser(user), async (tx) => {
    const course = await getCourseAndVerifyTeacher(tx, data.courseId, user.id);
    if (!course.centerId) {
      // grades.center_id stays NOT NULL in Step 4 — gradebook support for
      // teacher-direct courses is deliberately deferred (tracked for 4.5+).
      throw new BusinessRuleError("Grades are not yet available for teacher-direct courses");
    }

    const gradeType = data.gradeType || "numeric";
    const maxScore = gradeType === "letter" ? 4 : data.maxScore;

    const grade = await tx.grade.create({
      data: {
        courseId: data.courseId,
        centerId: course.centerId,
        teacherId: user.id,
        name: data.name,
        gradeType,
        maxScore,
        date: new Date(data.date),
        // Provenance inherited from the group (see the DataSource enum). A
        // teacher who joined the platform keeps entering grades on the groups
        // the center keyed in for them, and those stay labelled `manual`.
        dataSource: course.dataSource,
      },
      include: { scores: true },
    });
    return grade;
  });
}

export async function listGrades(
  filters: { courseId?: string; studentId?: string },
  user: SessionUser,
) {
  return scopedDb(asAuthUser(user), async (tx) => {
    const where: {
      courseId?: string | { in: string[] };
      centerId?: string;
      teacherId?: string;
    } = {};

    if (filters.courseId) where.courseId = filters.courseId;

    if (user.role === "center_admin") {
      where.centerId = user.centerId;
    } else if (user.role === "teacher") {
      where.teacherId = user.id;
    } else if (user.role === "student") {
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: user.id, status: "active" },
        select: { courseId: true },
      });
      where.courseId = { in: enrollments.map((e) => e.courseId) };
    } else if (user.role === "parent") {
      if (!filters.studentId) throw new BusinessRuleError("studentId is required");
      await assertParentLink(tx, user.id, filters.studentId);
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: filters.studentId, status: "active" },
        select: { courseId: true },
      });
      where.courseId = { in: enrollments.map((e) => e.courseId) };
    }

    const grades = await tx.grade.findMany({ where, include: { scores: true } });

    const courseIds = [...new Set(grades.map((g) => g.courseId))];
    const courses = await tx.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true, subject: true },
    });
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const enrich = (g: (typeof grades)[number]) => {
      const c = courseMap.get(g.courseId);
      return { ...g, courseName: c?.title ?? "", subject: c?.subject ?? "" };
    };

    if (user.role === "student") {
      return grades.map((g) => ({
        ...enrich(g),
        scores: g.scores.filter((s) => s.studentId === user.id),
      }));
    }
    if (user.role === "parent") {
      const childId = filters.studentId!;
      return grades.map((g) => ({
        ...enrich(g),
        scores: g.scores.filter((s) => s.studentId === childId),
      }));
    }

    return grades.map(enrich);
  });
}

export async function getGrade(gradeId: string, user: SessionUser) {
  return scopedDb(asAuthUser(user), async (tx) => {
    const grade = await tx.grade.findUnique({
      where: { id: gradeId },
      include: { scores: true },
    });
    if (!grade) throw new NotFoundError("Grade not found");

    if (user.role === "student") {
      return { ...grade, scores: grade.scores.filter((s) => s.studentId === user.id) };
    }
    if (user.role === "parent") {
      const links = await tx.parentStudentLink.findMany({
        where: { parentId: user.id, status: "approved" },
        select: { studentId: true },
      });
      const allowed = new Set(links.map((l) => l.studentId));
      return {
        ...grade,
        scores: grade.scores.filter((s) => allowed.has(s.studentId)),
      };
    }
    if (user.role === "center_admin") {
      if (grade.centerId !== user.centerId) throw new ForbiddenError();
      return grade;
    }
    if (user.role === "teacher") {
      if (grade.teacherId !== user.id) throw new ForbiddenError();
      return grade;
    }

    throw new ForbiddenError();
  });
}

export async function updateGrade(
  gradeId: string,
  data: Partial<{ name: string; maxScore: number; date: string }>,
  user: SessionUser,
) {
  return scopedDb(asAuthUser(user), async (tx) => {
    const grade = await tx.grade.findUnique({ where: { id: gradeId } });
    if (!grade) throw new NotFoundError("Grade not found");
    if (grade.teacherId !== user.id) throw new ForbiddenError();

    const patch: { name?: string; maxScore?: number; date?: Date } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.maxScore !== undefined) patch.maxScore = data.maxScore;
    if (data.date !== undefined) patch.date = new Date(data.date);

    return tx.grade.update({
      where: { id: gradeId },
      data: patch,
      include: { scores: true },
    });
  });
}

export async function deleteGrade(gradeId: string, user: SessionUser) {
  return scopedDb(asAuthUser(user), async (tx) => {
    const grade = await tx.grade.findUnique({ where: { id: gradeId } });
    if (!grade) throw new NotFoundError("Grade not found");
    if (grade.teacherId !== user.id) throw new ForbiddenError();
    await tx.grade.delete({ where: { id: gradeId } });
    return { deleted: true };
  });
}

export async function bulkUpsertScores(
  gradeId: string,
  scores: { studentId: string; score: number }[],
  user: SessionUser,
) {
  const grade = await scopedDb(asAuthUser(user), async (tx) => {
    const existing = await tx.grade.findUnique({ where: { id: gradeId } });
    if (!existing) throw new NotFoundError("Grade not found");
    if (existing.teacherId !== user.id) throw new ForbiddenError();

    const enrolled = await tx.enrollment.findMany({
      where: {
        courseId: existing.courseId,
        status: "active",
        studentId: { in: scores.map((s) => s.studentId) },
      },
      select: { studentId: true },
    });
    const enrolledSet = new Set(enrolled.map((e) => e.studentId));
    for (const entry of scores) {
      if (!enrolledSet.has(entry.studentId)) {
        throw new BusinessRuleError(
          `Student ${entry.studentId} is not enrolled in this course`,
        );
      }
    }

    const gradeType = existing.gradeType || "numeric";
    for (const entry of scores) {
      if (gradeType === "letter") {
        if (!VALID_LETTERS.has(numericToLetter(entry.score))) {
          throw new BusinessRuleError(
            `Score ${entry.score} is not a valid letter grade value (0-4 mapping to F-A)`,
          );
        }
      } else {
        if (entry.score < 0 || entry.score > existing.maxScore) {
          throw new BusinessRuleError(
            `Score ${entry.score} for student ${entry.studentId} is out of range [0, ${existing.maxScore}]`,
          );
        }
      }
    }

    for (const entry of scores) {
      await tx.gradeScore.upsert({
        where: { gradeId_studentId: { gradeId, studentId: entry.studentId } },
        create: { gradeId, studentId: entry.studentId, score: entry.score },
        update: { score: entry.score },
      });
    }

    return tx.grade.findUnique({ where: { id: gradeId }, include: { scores: true } });
  });

  for (const entry of scores) {
    await notify({
      recipients: await studentAndParents(entry.studentId),
      type: "grade_entered",
      title: "Grade entered",
      body: `A score for "${grade!.name}" has been recorded.`,
      data: { gradeId, score: entry.score, maxScore: grade!.maxScore, studentId: entry.studentId },
    });
  }

  return grade;
}
