import type { GradeType, Prisma } from "@repo/database";
import { scopedDb, type TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { notify } from "../notifications/notify";
import { assertManagedExternalTeacher, writeExternalTeacherAudit } from "./external-teachers";

function centerOf(acting: SessionUser): string {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return acting.centerId;
}

async function assertManualGradeScope(
  tx: TenantTx,
  centerId: string,
  teacherId: string,
  courseId: string,
) {
  await assertManagedExternalTeacher(tx, centerId, teacherId, { requireExternal: true });
  const course = await tx.course.findFirst({
    where: { id: courseId, centerId, teacherId },
    select: { id: true, title: true, centerId: true, dataSource: true },
  });
  if (!course) throw new NotFoundError("Group not found for this teacher");
  return course;
}

export async function createManualGrade(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  input: {
    courseId: string;
    name: string;
    maxScore: number;
    date: string;
    gradeType?: GradeType;
  },
) {
  const centerId = centerOf(actor.acting);
  const name = input.name.trim();
  if (!name) throw new BusinessRuleError("Assessment name is required");

  return scopedDb(actor.acting, async (tx) => {
    const course = await assertManualGradeScope(tx, centerId, teacherId, input.courseId);

    const gradeType: GradeType = input.gradeType ?? "numeric";
    const maxScore = gradeType === "letter" ? 4 : input.maxScore;
    if (maxScore <= 0) throw new BusinessRuleError("Max score must be positive");

    const grade = await tx.grade.create({
      data: {
        courseId: course.id,
        centerId,
        teacherId,
        name,
        gradeType,
        maxScore,
        date: new Date(input.date),
        dataSource: "manual",
      },
      include: { scores: true },
    });

    await writeExternalTeacherAudit(tx, {
      action: "external_teacher.grade_created",
      actorId: actor.actorId,
      onBehalfOf: actor.onBehalfOf ?? null,
      centerId,
      targetType: "grade",
      targetId: grade.id,
      after: { teacherId, courseId: course.id, name, maxScore, gradeType },
    });

    return grade;
  });
}

export async function setManualGradeScores(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  gradeId: string,
  scores: { studentId: string; score: number }[],
) {
  const centerId = centerOf(actor.acting);

  const { courseTitle, gradeName, changedStudents } = await scopedDb(
    actor.acting,
    async (tx) => {
      const grade = await tx.grade.findFirst({
        where: { id: gradeId, centerId, teacherId },
        select: { id: true, courseId: true, name: true, maxScore: true },
      });
      if (!grade) throw new NotFoundError("Assessment not found");
      const course = await assertManualGradeScope(tx, centerId, teacherId, grade.courseId);

      const enrolled = await tx.enrollment.findMany({
        where: { courseId: grade.courseId, centerId, status: "active" },
        select: { studentId: true },
      });
      const enrolledSet = new Set(enrolled.map((e) => e.studentId));

      const before = await tx.gradeScore.findMany({
        where: { gradeId: grade.id },
        select: { studentId: true, score: true },
      });
      const previous = new Map(before.map((s) => [s.studentId, s.score]));

      const changed: string[] = [];
      for (const entry of scores) {
        if (!enrolledSet.has(entry.studentId)) {
          throw new BusinessRuleError("Some students are not enrolled in this group", {
            invalidStudentIds: [entry.studentId],
          });
        }
        if (entry.score < 0 || entry.score > grade.maxScore) {
          throw new BusinessRuleError(
            `Score must be between 0 and ${grade.maxScore}`,
          );
        }
        await tx.gradeScore.upsert({
          where: { gradeId_studentId: { gradeId: grade.id, studentId: entry.studentId } },
          create: { gradeId: grade.id, studentId: entry.studentId, score: entry.score },
          update: { score: entry.score },
        });
        if (previous.get(entry.studentId) !== entry.score) changed.push(entry.studentId);
      }

      await writeExternalTeacherAudit(tx, {
        action: "external_teacher.grade_scores_set",
        actorId: actor.actorId,
        onBehalfOf: actor.onBehalfOf ?? null,
        centerId,
        targetType: "grade",
        targetId: grade.id,
        before: before as unknown as Prisma.InputJsonValue,
        after: scores as unknown as Prisma.InputJsonValue,
      });

      return {
        courseTitle: course.title,
        gradeName: grade.name,
        changedStudents: changed,
      };
    },
  );

  for (const studentId of changedStudents) {
    await notify({
      recipients: [studentId],
      type: "grade_entered",
      title: "Grade recorded",
      body: `A grade for "${gradeName}" in ${courseTitle} has been recorded.`,
      data: { gradeId, studentId },
    });
  }

  return { updated: changedStudents.length, total: scores.length };
}

export async function listManualGrades(
  acting: SessionUser,
  teacherId: string,
  filters: { courseId?: string | null } = {},
) {
  const centerId = centerOf(acting);
  return scopedDb(acting, async (tx) => {
    await assertManagedExternalTeacher(tx, centerId, teacherId);
    return tx.grade.findMany({
      where: {
        centerId,
        teacherId,
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
      },
      orderBy: { date: "desc" },
      include: { scores: true },
      take: 200,
    });
  });
}
