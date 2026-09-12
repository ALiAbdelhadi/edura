import { platformDb, type TenantTx } from "../../db/scope";
import { runEffects, type WithEffects, type DeferredEffect } from "../../db/effects";
import { NotFoundError, ConflictError, BusinessRuleError } from "../../errors/classes";
import { isOnCenterRoster } from "../center/roster-membership";
import { generateFamilyCode, generateInviteCode } from "../../utils/random";
import { sendMail } from "../../mail/send";
import type { SessionUser } from "../../auth/types";
import { walletCredit, walletDebit } from "../wallet/wallet";
import { isUniqueViolation } from "../../errors/prisma";


export async function createTempStudent(
  input: { fullName: string; phone: string; grade?: string },
  creator: SessionUser,
) {
  return platformDb((tx) => createTempStudentTx(tx, input, creator), { actorId: creator.id });
}

export async function createTempStudentTx(
  tx: TenantTx,
  input: { fullName: string; phone: string; grade?: string },
  creator: SessionUser,
) {
  const phone = input.phone.trim();
  return (async () => {
    {
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
        studentCode: profile.studentCode, // Step 6: typeable counter ID
      };
    }
  })();
}

async function callerOwnsTempStudent(
  tx: TenantTx,
  tempUserId: string,
  actor: SessionUser,
): Promise<boolean> {
  // This gate stands in front of an invite code, which is a claim credential: it
  // merges the temp student's history into whoever redeems it. Membership therefore
  // has to be CURRENT, not merely historical.
  if (actor.role === "center_admin") {
    if (!actor.centerId) return false;
    return isOnCenterRoster(tx, actor.centerId, tempUserId);
  }
  if (actor.role === "teacher") {
    const enrollment = await tx.enrollment.findFirst({
      where: { studentId: tempUserId, status: "active", course: { teacherId: actor.id } },
      select: { id: true },
    });
    return enrollment !== null;
  }
  return false;
}

export async function sendTempStudentInvite(tempUserId: string, actor: SessionUser) {
  const { value, effects } = await platformDb(
    (tx) => sendTempStudentInviteTx(tx, tempUserId, actor),
    { actorId: actor.id },
  );
  await runEffects(effects);
  return value;
}

export async function sendTempStudentInviteTx(
  tx: TenantTx,
  tempUserId: string,
  actor: SessionUser,
): Promise<WithEffects<{ sent: boolean; inviteCode: string | null; phone: string | null }>> {
  return (async () => {
    {
      if (!(await callerOwnsTempStudent(tx, tempUserId, actor))) {
        throw new NotFoundError("Temp student not found");
      }

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

      // The mail used to be awaited INSIDE this transaction; it is now deferred
      // to after the commit, like every other outbound channel in this codebase.
      const effects: DeferredEffect[] = profile.phone
        ? [
            () =>
              sendMail({
                to: `${profile.phone}@sms.local`,
                subject: "Edura invite",
                text: `Your code is ${profile.inviteCode} — join Edura and register with this phone to keep your history.`,
              })
                .then(() => undefined)
                .catch(() => undefined),
          ]
        : [];

      return {
        value: { sent: true, inviteCode: profile.inviteCode, phone: profile.phone },
        effects,
      };
    }
  })();
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
      await tx.paymentIntent.updateMany({ where: { studentId: shellId }, data: { studentId: user.id } });

      // SECURITY_AUDIT.md (2026-09-11) BIZ-05. The claim re-pointed receipts
      // but not the COVERAGE those receipts bought, and it deleted the shell
      // profile that carried the wallet balance — a child who was topped up in
      // cash and paid for the month at the counter, then registered and typed
      // the code, lost both. Coverage is re-pointed row by row: a subscription
      // the claimant already holds for the same course/session (the partial
      // uniques) stays on the shell, which is reported rather than clobbered.
      let subscriptionsSkipped = 0;
      for (const s of await tx.subscription.findMany({ where: { studentId: shellId }, select: { id: true } })) {
        try {
          await tx.subscription.update({ where: { id: s.id }, data: { studentId: user.id } });
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          subscriptionsSkipped += 1;
        }
      }

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
      // The wallet ledger is append-only, so the balance is not "re-pointed":
      // it is moved by two ledger rows — the shell debited to zero, the
      // claimant credited the same amount — both inside this transaction.
      const walletCarried = profile.walletBalance;
      if (walletCarried > 0) {
        if (!myProfile) {
          throw new BusinessRuleError("Your account has no student profile to receive the claimed balance");
        }
        const reason = `Wallet carried on claim of invite ${inviteCode} (shell ${shellId})`;
        await walletDebit(tx, shellId, walletCarried, { type: "adjustment", reason });
        await walletCredit(tx, user.id, walletCarried, { type: "adjustment", reason });
      }
      if (myProfile) {
        await tx.studentProfile.update({
          where: { id: myProfile.id },
          data: { pointsBalance: myProfile.pointsBalance + profile.pointsBalance, entityType: "registered", claimedAt: new Date() },
        });
      }
      await tx.studentProfile.delete({ where: { id: profile.id } });
      await tx.user.update({ where: { id: shellId }, data: { status: "deleted", deletedAt: new Date() } });

      return { merged: true, from: shellId, into: user.id, walletCarried, subscriptionsSkipped };
    },
    { actorId: user.id },
  );
}
