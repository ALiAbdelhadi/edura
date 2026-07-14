import { platformDb } from "@/lib/db/scope";
import { NotFoundError, ConflictError, BusinessRuleError } from "@/lib/errors/classes";
import { generateFamilyCode, generateInviteCode } from "@/lib/utils/random";
import { sendMail } from "@/lib/mail/send";
import type { SessionUser } from "@/lib/auth/session";


export async function createTempStudent(
  input: { fullName: string; phone: string; grade?: string },
  creator: SessionUser,
) {
  const phone = input.phone.trim();
  return platformDb(
    async (tx) => {
      const active = await tx.user.findFirst({
        where: { phone, status: { notIn: ["deleted", "shell"] } },
        select: { id: true },
      });
      if (active) {
        throw new ConflictError("A registered user already has this phone — use lookup to link instead");
      }

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


      for (const rec of await tx.attendanceRecord.findMany({ where: { studentId: shellId }, select: { id: true, sessionId: true } })) {
        const clash = await tx.attendanceRecord.findFirst({ where: { sessionId: rec.sessionId, studentId: user.id }, select: { id: true } });
        if (clash) await tx.attendanceRecord.delete({ where: { id: rec.id } });
        else await tx.attendanceRecord.update({ where: { id: rec.id }, data: { studentId: user.id } });
      }
      for (const gs of await tx.gradeScore.findMany({ where: { studentId: shellId }, select: { id: true, gradeId: true } })) {
        const clash = await tx.gradeScore.findFirst({ where: { gradeId: gs.gradeId, studentId: user.id }, select: { id: true } });
        if (clash) await tx.gradeScore.delete({ where: { id: gs.id } });
        else await tx.gradeScore.update({ where: { id: gs.id }, data: { studentId: user.id } });
      }
      for (const rv of await tx.review.findMany({ where: { studentId: shellId }, select: { id: true, teacherId: true } })) {
        const clash = await tx.review.findFirst({ where: { studentId: user.id, teacherId: rv.teacherId }, select: { id: true } });
        if (clash) await tx.review.delete({ where: { id: rv.id } });
        else await tx.review.update({ where: { id: rv.id }, data: { studentId: user.id } });
      }
      await tx.enrollmentRequest.updateMany({ where: { studentId: shellId }, data: { studentId: user.id } });
      await tx.payment.updateMany({ where: { studentId: shellId }, data: { studentId: user.id } });

      const shellEnrollments = await tx.enrollment.findMany({ where: { studentId: shellId } });
      for (const e of shellEnrollments) {
        const clash = await tx.enrollment.findFirst({
          where: { studentId: user.id, courseId: e.courseId, status: "active" },
        });
        if (clash) continue;
        await tx.enrollment.update({ where: { id: e.id }, data: { studentId: user.id } });
      }

      const shellRosters = await tx.centerStudentRoster.findMany({ where: { studentId: shellId } });
      for (const r of shellRosters) {
        const clash = await tx.centerStudentRoster.findFirst({
          where: { centerId: r.centerId, studentId: user.id },
        });
        if (clash) await tx.centerStudentRoster.delete({ where: { id: r.id } });
        else await tx.centerStudentRoster.update({ where: { id: r.id }, data: { studentId: user.id } });
      }

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
