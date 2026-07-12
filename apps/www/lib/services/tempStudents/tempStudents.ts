import { platformDb } from "@/lib/db/scope";
import { NotFoundError, ConflictError, BusinessRuleError } from "@/lib/errors/classes";
import { generateFamilyCode, generateInviteCode } from "@/lib/utils/random";
import { sendMail } from "@/lib/mail/send";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Temporary students & merge (PRD §4.8 / §5.4).
 *
 * A temp student is a `shell` User (status="shell", no password) whose
 * StudentProfile is entity_type="invited" and carries an invite_code. Teachers
 * or center admins create them so attendance/grades/payments can be recorded
 * against a real user id BEFORE the student registers. All operational records
 * reference users.id, so the common merge path — registering with the same
 * phone/invite code — simply ACTIVATES the shell in place and every historical
 * record is preserved with zero re-pointing (see auth/register.ts).
 *
 * `claimTempStudent` handles the harder case (PRD §5.4 step 8): a person who
 * already registered as a NEW user later claims a temp profile — records are
 * re-pointed from the shell id to their real user id and the shell is retired.
 */

export async function createTempStudent(
  input: { fullName: string; phone: string; grade?: string },
  creator: SessionUser,
) {
  const phone = input.phone.trim();
  return platformDb(
    async (tx) => {
      // A registered (non-shell) user already owns this phone → link, don't create.
      const active = await tx.user.findFirst({
        where: { phone, status: { notIn: ["deleted", "shell"] } },
        select: { id: true },
      });
      if (active) {
        throw new ConflictError("A registered user already has this phone — use lookup to link instead");
      }

      // Reuse an existing shell for this phone if present.
      let shell = await tx.user.findFirst({ where: { phone, status: "shell" } });
      shell ??= await tx.user.create({
        data: { phone, name: input.fullName, role: "student", status: "shell", passwordHash: null },
      });

      const inviteCode = generateInviteCode();
      const profile = await tx.studentProfile.upsert({
        where: { userId: shell.id },
        create: {
          userId: shell.id,
          fullName: input.fullName,
          phone,
          grade: input.grade ?? null,
          entityType: "invited",
          inviteCode,
          familyLinkCode: generateFamilyCode(),
        },
        update: {
          fullName: input.fullName,
          grade: input.grade ?? null,
          entityType: "invited",
          inviteCode,
        },
      });

      // A center_admin adds the temp student to their roster.
      if (creator.role === "center_admin" && creator.centerId) {
        await tx.centerStudentRoster.upsert({
          where: { centerId_studentId: { centerId: creator.centerId, studentId: shell.id } },
          create: { centerId: creator.centerId, studentId: shell.id, addedAt: new Date() },
          update: {},
        });
      }

      return {
        id: shell.id,
        studentProfileId: profile.id,
        fullName: profile.fullName,
        phone,
        inviteCode,
        entityType: profile.entityType,
      };
    },
    { actorId: creator.id },
  );
}

export async function sendTempStudentInvite(tempUserId: string, actor: SessionUser) {
  return platformDb(
    async (tx) => {
      const profile = await tx.studentProfile.findFirst({
        where: { userId: tempUserId },
        select: { id: true, fullName: true, phone: true, inviteCode: true, entityType: true },
      });
      if (!profile) throw new NotFoundError("Temp student not found");
      if (profile.entityType !== "invited") {
        throw new BusinessRuleError("This student is not an invited temp student");
      }
      if (!profile.inviteCode) throw new BusinessRuleError("Temp student has no invite code");

      await tx.studentProfile.update({
        where: { id: profile.id },
        data: { invitationSentAt: new Date() },
      });

      // No SMS provider wired — send via the mail stub (console in dev). PRD §5.4
      // wants SMS/WhatsApp: `Your code is {invite_code} - join Edura`.
      if (profile.phone) {
        await sendMail({
          to: `${profile.phone}@sms.local`,
          subject: "Edura invite",
          text: `Your code is ${profile.inviteCode} — join Edura and register with this phone to keep your history.`,
        }).catch(() => {});
      }

      return { sent: true, inviteCode: profile.inviteCode, phone: profile.phone };
    },
    { actorId: actor.id },
  );
}

/**
 * Claim a temp student's history into the CALLER's already-registered account
 * (PRD §5.4 step 8). Re-points operational records from the shell user id to the
 * caller, merges points, then retires the shell.
 */
export async function claimTempStudent(inviteCode: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const profile = await tx.studentProfile.findUnique({ where: { inviteCode } });
      if (!profile || !profile.userId) throw new NotFoundError("Invite code not found");
      const shellId = profile.userId;
      if (shellId === user.id) return { merged: false, reason: "already_yours" };

      const shell = await tx.user.findUnique({ where: { id: shellId }, select: { status: true } });
      if (!shell || shell.status !== "shell") {
        throw new BusinessRuleError("This invite code is not claimable");
      }

      // Re-point operational records (all keyed by users.id). points_ledger is
      // append-only and temp students have none, so it is intentionally skipped.
      // Tables with a per-student unique constraint are re-pointed PER ROW with a
      // clash check — a blind updateMany would hit P2002 (and abort the whole
      // merge) whenever the caller already has a row for the same key.

      // attendance_records: unique (session_id, student_id)
      for (const rec of await tx.attendanceRecord.findMany({ where: { studentId: shellId }, select: { id: true, sessionId: true } })) {
        const clash = await tx.attendanceRecord.findFirst({ where: { sessionId: rec.sessionId, studentId: user.id }, select: { id: true } });
        if (clash) await tx.attendanceRecord.delete({ where: { id: rec.id } });
        else await tx.attendanceRecord.update({ where: { id: rec.id }, data: { studentId: user.id } });
      }
      // grade_scores: unique (grade_id, student_id)
      for (const gs of await tx.gradeScore.findMany({ where: { studentId: shellId }, select: { id: true, gradeId: true } })) {
        const clash = await tx.gradeScore.findFirst({ where: { gradeId: gs.gradeId, studentId: user.id }, select: { id: true } });
        if (clash) await tx.gradeScore.delete({ where: { id: gs.id } });
        else await tx.gradeScore.update({ where: { id: gs.id }, data: { studentId: user.id } });
      }
      // reviews: unique (student_id, teacher_id)
      for (const rv of await tx.review.findMany({ where: { studentId: shellId }, select: { id: true, teacherId: true } })) {
        const clash = await tx.review.findFirst({ where: { studentId: user.id, teacherId: rv.teacherId }, select: { id: true } });
        if (clash) await tx.review.delete({ where: { id: rv.id } });
        else await tx.review.update({ where: { id: rv.id }, data: { studentId: user.id } });
      }
      // No per-student unique — safe to bulk re-point.
      await tx.enrollmentRequest.updateMany({ where: { studentId: shellId }, data: { studentId: user.id } });
      await tx.payment.updateMany({ where: { studentId: shellId }, data: { studentId: user.id } });

      // Enrollments: avoid violating the unique (studentId, courseId) active index.
      const shellEnrollments = await tx.enrollment.findMany({ where: { studentId: shellId } });
      for (const e of shellEnrollments) {
        const clash = await tx.enrollment.findFirst({
          where: { studentId: user.id, courseId: e.courseId, status: "active" },
        });
        if (clash) continue; // caller already enrolled — drop the shell's duplicate
        await tx.enrollment.update({ where: { id: e.id }, data: { studentId: user.id } });
      }

      // Roster: move center memberships, avoiding the unique (centerId, studentId).
      const shellRosters = await tx.centerStudentRoster.findMany({ where: { studentId: shellId } });
      for (const r of shellRosters) {
        const clash = await tx.centerStudentRoster.findFirst({
          where: { centerId: r.centerId, studentId: user.id },
        });
        if (clash) await tx.centerStudentRoster.delete({ where: { id: r.id } });
        else await tx.centerStudentRoster.update({ where: { id: r.id }, data: { studentId: user.id } });
      }

      // Merge points balance, then retire the shell profile + user.
      const myProfile = await tx.studentProfile.findUnique({
        where: { userId: user.id },
        select: { id: true, pointsBalance: true },
      });
      if (myProfile) {
        await tx.studentProfile.update({
          where: { id: myProfile.id },
          data: { pointsBalance: myProfile.pointsBalance + profile.pointsBalance, entityType: "registered", claimedAt: new Date() },
        });
      }
      await tx.studentProfile.delete({ where: { id: profile.id } });
      await tx.user.update({ where: { id: shellId }, data: { status: "deleted", deletedAt: new Date() } });

      return { merged: true, from: shellId, into: user.id };
    },
    { actorId: user.id },
  );
}
