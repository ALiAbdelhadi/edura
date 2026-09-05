import { platformDb, scopedDb, type TenantTx } from "@/lib/db/scope";
import { runEffects } from "@repo/server-core/db/effects";
import { writeAdminAudit } from "@/lib/services/admin/admin-audit";
import type { SessionUser } from "@/lib/auth/session";
import { superadminAsCenter } from "@/lib/authz/center-actor";
import {
  listRosterStudents,
  addRosterStudentTx,
  getRosterStudent,
  updateRosterStudentTx,
  removeRosterStudentTx,
  inviteStudentTx,
  listRosterTeachers,
  removeRosterTeacherTx,
  inviteTeacherTx,
  type RosterStudentPatch,
} from "@repo/server-core/services/center/roster";
import {
  listCenterAdmins,
  removeCenterAdminTx,
  inviteCenterAdminTx,
} from "@repo/server-core/services/center/admins";
import {
  listStaff,
  createStaffTx,
  updateStaffTx,
  removeStaffTx,
  resendStaffInviteTx,
} from "@repo/server-core/services/center/staff";
import {
  createCollaborationRequestTx,
  type CollaborationInput,
} from "@repo/server-core/services/collaboration/collaboration";

function userSnapshot(tx: TenantTx, userId: string) {
  return tx.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, status: true, role: true },
  });
}

function rosterSnapshot(tx: TenantTx, centerId: string, studentId: string) {
  return tx.centerStudentRoster.findFirst({
    where: { centerId, studentId },
    select: {
      id: true,
      leftAt: true,
      blacklisted: true,
      blacklistReason: true,
      operationalParentName: true,
      operationalParentPhone: true,
    },
  });
}

export async function adminListStudents(
  actor: SessionUser,
  centerId: string,
  filters: { blacklisted?: string; courseId?: string; q?: string } = {},
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listRosterStudents(acting, filters);
}

export async function adminGetStudent(actor: SessionUser, centerId: string, studentId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return getRosterStudent(acting, studentId);
}

export async function adminAddStudent(actor: SessionUser, centerId: string, studentId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const outcome = await addRosterStudentTx(tx, acting, studentId);
    await writeAdminAudit(tx, actor, {
      action: "center.student_added",
      targetType: "user",
      targetId: studentId,
      centerId,
      before: { onRoster: false },
      after: { onRoster: true, rosterId: outcome.value.id },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}

export async function adminUpdateStudent(
  actor: SessionUser,
  centerId: string,
  studentId: string,
  patch: RosterStudentPatch,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const [userBefore, rosterBefore] = await Promise.all([
      userSnapshot(tx, studentId),
      rosterSnapshot(tx, centerId, studentId),
    ]);
    const result = await updateRosterStudentTx(tx, acting, studentId, patch);
    await writeAdminAudit(tx, actor, {
      action: "center.student_updated",
      targetType: "user",
      targetId: studentId,
      centerId,
      before: { user: userBefore, roster: rosterBefore },
      after: { changed: Object.keys(patch), user: result.user },
    });
    return result;
  });
}

export async function adminRemoveStudent(actor: SessionUser, centerId: string, studentId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const before = await rosterSnapshot(tx, centerId, studentId);
    const result = await removeRosterStudentTx(tx, acting, studentId);
    await writeAdminAudit(tx, actor, {
      action: "center.student_roster_removed",
      targetType: "user",
      targetId: studentId,
      centerId,
      before: { onRoster: true, roster: before },
      after: { onRoster: false, enrollmentsTouched: false },
    });
    return result;
  });
}

export async function adminInviteStudent(
  actor: SessionUser,
  centerId: string,
  body: { email: string; name?: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const outcome = await inviteStudentTx(tx, acting, body);
    await writeAdminAudit(tx, actor, {
      action: "center.student_invited",
      targetType: "user",
      targetId: outcome.value.user.id,
      centerId,
      before: null,
      after: {
        email: body.email,
        userId: outcome.value.user.id,
        status: outcome.value.user.status,
      },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}

export async function adminListTeachers(
  actor: SessionUser,
  centerId: string,
  filters: { status?: string } = {},
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listRosterTeachers(acting, filters);
}

export async function adminRemoveTeacher(actor: SessionUser, centerId: string, teacherId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const before = await tx.centerTeacherAffiliation.findFirst({
      where: { centerId, teacherId, status: { in: ["pending", "active"] } },
      select: { id: true, status: true, centerShare: true },
    });
    const result = await removeRosterTeacherTx(tx, acting, teacherId);
    await writeAdminAudit(tx, actor, {
      action: "center.teacher_removed",
      targetType: "user",
      targetId: teacherId,
      centerId,
      before: { affiliation: before },
      after: { affiliationStatus: "removed" },
    });
    return result;
  });
}

export async function adminInviteTeacher(
  actor: SessionUser,
  centerId: string,
  body: { email: string; name?: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const outcome = await inviteTeacherTx(tx, acting, body);
    await writeAdminAudit(tx, actor, {
      action: "center.teacher_invited",
      targetType: "user",
      targetId: outcome.value.user.id,
      centerId,
      before: null,
      after: {
        email: body.email,
        userId: outcome.value.user.id,
        affiliationId: outcome.value.affiliation.id,
        centerShareWritten: false,
      },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}

export async function adminCreateCollaborationRequest(
  actor: SessionUser,
  centerId: string,
  input: Omit<CollaborationInput, "centerId">,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await platformDb(
    async (tx) => {
      const outcome = await createCollaborationRequestTx(tx, { ...input, centerId }, acting);
      const request = outcome.value;
      await writeAdminAudit(tx, actor, {
        action: "collaboration_request.created",
        targetType: "collaboration_request",
        targetId: request.id,
        centerId,
        before: null,
        after: {
          teacherId: request.teacherId,
          subjectId: request.subjectId,
          gradeLevelId: request.gradeLevelId,
          trackId: request.trackId,
          roomId: request.roomId,
          initiator: request.initiator,
          status: request.status,
          startDate: request.startDate,
          proposedPricingMethod: request.proposedPricingMethod,
          proposedCenterShare: request.proposedCenterShare,
        },
      });
      return outcome;
    },
    { actorId: actor.id },
  );
  await runEffects(effects);
  return value;
}

export async function adminListStaff(actor: SessionUser, centerId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listStaff(acting);
}

export async function adminCreateStaff(
  actor: SessionUser,
  centerId: string,
  data: {
    name: string;
    email: string;
    role: "receptionist" | "manager" | "center_accountant";
    title?: string;
    locale?: "ar" | "en";
  },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await platformDb(
    async (tx) => {
      const outcome = await createStaffTx(tx, acting, data);
      const r = outcome.value;
      await writeAdminAudit(tx, actor, {
        action: "center.staff_created",
        targetType: "center_staff",
        targetId: r.link.id,
        centerId,
        before: null,
        after: {
          staffUserId: r.user.id,
          email: data.email,
          role: r.link.role,
          title: r.link.title,
          existingAccount: r.existingAccount,
        },
      });
      return outcome;
    },
    { actorId: actor.id },
  );
  await runEffects(effects);
  return value;
}

export async function adminUpdateStaff(
  actor: SessionUser,
  centerId: string,
  linkId: string,
  data: { role?: "receptionist" | "manager" | "center_accountant"; title?: string | null; active?: boolean },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const before = await tx.centerStaff.findUnique({
      where: { id: linkId },
      select: { id: true, role: true, title: true, removedAt: true, staffUserId: true },
    });
    const result = await updateStaffTx(tx, acting, linkId, data);
    await writeAdminAudit(tx, actor, {
      action: "center.staff_updated",
      targetType: "center_staff",
      targetId: linkId,
      centerId,
      before,
      after: { changed: Object.keys(data), ...data },
    });
    return result;
  });
}

export async function adminRemoveStaff(actor: SessionUser, centerId: string, linkId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const before = await tx.centerStaff.findUnique({
      where: { id: linkId },
      select: { id: true, role: true, title: true, removedAt: true, staffUserId: true },
    });
    const result = await removeStaffTx(tx, acting, linkId);
    await writeAdminAudit(tx, actor, {
      action: "center.staff_removed",
      targetType: "center_staff",
      targetId: linkId,
      centerId,
      before,
      after: { removed: true },
    });
    return result;
  });
}

export async function adminResendStaffInvite(
  actor: SessionUser,
  centerId: string,
  linkId: string,
  opts: { locale?: "ar" | "en" } = {},
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const outcome = await resendStaffInviteTx(tx, acting, linkId, opts.locale ?? "ar");
    await writeAdminAudit(tx, actor, {
      action: "center.staff_invite_resent",
      targetType: "center_staff",
      targetId: linkId,
      centerId,
      before: null,
      after: { resent: true },
    });
    return outcome;
  });
  await runEffects(effects);
  return value.invite;
}

export async function adminListCenterAdmins(actor: SessionUser, centerId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return listCenterAdmins(acting);
}

export async function adminInviteCenterAdmin(
  actor: SessionUser,
  centerId: string,
  body: { email: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const { value, effects } = await scopedDb(acting, async (tx) => {
    const outcome = await inviteCenterAdminTx(tx, acting, body);
    await writeAdminAudit(tx, actor, {
      action: "center.admin_invited",
      targetType: "center",
      targetId: centerId,
      centerId,
      before: null,
      after: { email: body.email, existingUser: outcome.value.existingUser },
    });
    return outcome;
  });
  await runEffects(effects);
  return value;
}

export async function adminRemoveCenterAdmin(
  actor: SessionUser,
  centerId: string,
  userId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return scopedDb(acting, async (tx) => {
    const before = await userSnapshot(tx, userId);
    const result = await removeCenterAdminTx(tx, acting, userId, null);
    await writeAdminAudit(tx, actor, {
      action: "center.admin_removed",
      targetType: "user",
      targetId: userId,
      centerId,
      before: { admin: before },
      after: { removed: true },
    });
    return result;
  });
}
