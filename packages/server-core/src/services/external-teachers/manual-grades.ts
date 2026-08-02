// =============================================================================
// MANUAL GRADES — the one operational surface a center could NOT already reach.
//
// Read this list before adding anything here, because most of what an
// off-system teacher needs ALREADY WORKS with no new code:
//   * groups        -> services/center/courses.createCourse (it requires an
//                      ACTIVE affiliation, which an external teacher has)
//   * schedule      -> generateSessions, from the same call
//   * enrolment     -> external-teachers/manual-students
//   * attendance    -> POST /api/v1/sessions/[id]/attendance already accepts a
//                      center_admin for any session at their own center, and
//                      the counter check-in accepts center staff
//   * money         -> createWalkInSubscription (cash at the counter) writes
//                      Payment + Transaction + receipt + points + parent
//                      notification, exactly as for an on-platform teacher
//   * settlement    -> completeSession -> distributeSessionRevenue, unchanged
//
// GRADES are the exception. `createGrade` demands `course.teacherId === user.id`
// — right for a teacher who signs in, impossible for one who never will. The
// fix is NOT to loosen that gate (it protects every on-platform course); it is
// this narrow center-side path, which can only ever reach a group belonging to
// an off-system teacher this center manages.
//
// The scores API is deliberately the SAME shape as the teacher's
// (bulkUpsertScores semantics), so the gradebook a parent or student sees is
// identical whichever side entered it.
// =============================================================================

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

/**
 * The gate every function here runs first: the group must belong to an
 * off-system teacher THIS center manages. Both halves matter — the course being
 * at this center is not enough (that would reach on-platform teachers' groups,
 * which is precisely what createGrade's teacher check exists to prevent).
 */
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
    // Same normalisation the teacher path uses: a letter grade is scored out of
    // 4 regardless of what the caller sent, so the two entry points cannot
    // produce differently-scaled letter grades.
    const maxScore = gradeType === "letter" ? 4 : input.maxScore;
    if (maxScore <= 0) throw new BusinessRuleError("Max score must be positive");

    const grade = await tx.grade.create({
      data: {
        courseId: course.id,
        centerId,
        // The TEACHER owns the assessment, not the staff member who typed it.
        // That is what makes it appear in the teacher's own gradebook the day
        // they join the platform. WHO typed it is in the audit row below.
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
        // Refusing an unenrolled student is not pedantry: a score on a child
        // who is not in the group is a score nobody will ever see, and it would
        // quietly corrupt the class average.
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

  // The SAME notification a teacher-entered grade fires. A parent must not be
  // able to tell from their phone whether their child's teacher is on the
  // platform — that is the whole promise of this feature.
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

/** The teacher's gradebook, center-side. Read-only. */
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
