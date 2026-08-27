import { platformDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { superadminAsCenter } from "@/lib/authz/center-actor";
import {
  listRosterStudents,
  addRosterStudent,
  getRosterStudent,
  updateRosterStudent,
  removeRosterStudent,
  lookupStudent,
  inviteStudent,
  listRosterTeachers,
  removeRosterTeacher,
  lookupTeacher,
  inviteTeacher,
  type RosterStudentPatch,
} from "@repo/server-core/services/center/roster";
import {
  listCenterAdmins,
  removeCenterAdmin,
  inviteCenterAdmin,
} from "@repo/server-core/services/center/admins";
import {
  listStaff,
  createStaff,
  updateStaff,
  removeStaff,
  resendStaffInvite,
} from "@repo/server-core/services/center/staff";
import {
  createCollaborationRequest,
  type CollaborationInput,
} from "@repo/server-core/services/collaboration/collaboration";

type AuditSpec = {
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
};

async function audit(actor: SessionUser, centerId: string, spec: AuditSpec) {
  await platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: spec.action,
          targetType: spec.targetType,
          targetId: spec.targetId,
          centerId,
          beforeState: (spec.before ?? undefined) as never,
          afterState: (spec.after ?? undefined) as never,
          onBehalfOf: null,
        },
      }),
    { actorId: actor.id },
  );
}

async function snapshotUser(userId: string) {
  return platformDb((tx) =>
    tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, status: true, role: true },
    }),
  );
}

async function snapshotRoster(centerId: string, studentId: string) {
  return platformDb((tx) =>
    tx.centerStudentRoster.findFirst({
      where: { centerId, studentId },
      select: {
        id: true,
        leftAt: true,
        blacklisted: true,
        blacklistReason: true,
        operationalParentName: true,
        operationalParentPhone: true,
      },
    }),
  );
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
  const result = await addRosterStudent(acting, studentId);
  await audit(actor, centerId, {
    action: "center.student_added",
    targetType: "user",
    targetId: studentId,
    before: { onRoster: false },
    after: { onRoster: true, rosterId: result.id },
  });
  return result;
}

export async function adminUpdateStudent(
  actor: SessionUser,
  centerId: string,
  studentId: string,
  patch: RosterStudentPatch,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const [userBefore, rosterBefore] = await Promise.all([
    snapshotUser(studentId),
    snapshotRoster(centerId, studentId),
  ]);
  const result = await updateRosterStudent(acting, studentId, patch);
  await audit(actor, centerId, {
    action: "center.student_updated",
    targetType: "user",
    targetId: studentId,
    before: { user: userBefore, roster: rosterBefore },
    after: { changed: Object.keys(patch), user: result.user },
  });
  return result;
}

export async function adminRemoveStudent(actor: SessionUser, centerId: string, studentId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await snapshotRoster(centerId, studentId);
  const result = await removeRosterStudent(acting, studentId);
  await audit(actor, centerId, {
    action: "center.student_roster_removed",
    targetType: "user",
    targetId: studentId,
    before: { onRoster: true, roster: before },
    after: { onRoster: false, enrollmentsTouched: false },
  });
  return result;
}

export async function adminLookupStudent(
  actor: SessionUser,
  centerId: string,
  body: { email?: string; phone?: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return lookupStudent(acting, body);
}

export async function adminInviteStudent(
  actor: SessionUser,
  centerId: string,
  body: { email: string; name?: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await inviteStudent(acting, body);
  await audit(actor, centerId, {
    action: "center.student_invited",
    targetType: "user",
    targetId: result.user.id,
    before: null,
    after: { email: body.email, userId: result.user.id, status: result.user.status },
  });
  return result;
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
  const before = await platformDb((tx) =>
    tx.centerTeacherAffiliation.findFirst({
      where: { centerId, teacherId, status: { in: ["pending", "active"] } },
      select: { id: true, status: true, centerShare: true },
    }),
  );
  const result = await removeRosterTeacher(acting, teacherId);
  await audit(actor, centerId, {
    action: "center.teacher_removed",
    targetType: "user",
    targetId: teacherId,
    before: { affiliation: before },
    after: { affiliationStatus: "removed" },
  });
  return result;
}

export async function adminLookupTeacher(
  actor: SessionUser,
  centerId: string,
  body: { email: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  return lookupTeacher(acting, body);
}

export async function adminInviteTeacher(
  actor: SessionUser,
  centerId: string,
  body: { email: string; name?: string },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await inviteTeacher(acting, body);
  await audit(actor, centerId, {
    action: "center.teacher_invited",
    targetType: "user",
    targetId: result.user.id,
    before: null,
    after: {
      email: body.email,
      userId: result.user.id,
      affiliationId: result.affiliation.id,
      centerShareWritten: false,
    },
  });
  return result;
}

export async function adminCreateCollaborationRequest(
  actor: SessionUser,
  centerId: string,
  input: Omit<CollaborationInput, "centerId">,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const request = await createCollaborationRequest({ ...input, centerId }, acting);
  await audit(actor, centerId, {
    action: "collaboration_request.created",
    targetType: "collaboration_request",
    targetId: request.id,
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
  return request;
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
  const result = await createStaff(acting, data);
  await audit(actor, centerId, {
    action: "center.staff_created",
    targetType: "center_staff",
    targetId: result.link.id,
    before: null,
    after: {
      staffUserId: result.user.id,
      email: data.email,
      role: result.link.role,
      title: result.link.title,
      existingAccount: result.existingAccount,
    },
  });
  return result;
}

export async function adminUpdateStaff(
  actor: SessionUser,
  centerId: string,
  linkId: string,
  data: { role?: "receptionist" | "manager" | "center_accountant"; title?: string | null; active?: boolean },
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await platformDb((tx) =>
    tx.centerStaff.findUnique({
      where: { id: linkId },
      select: { id: true, role: true, title: true, removedAt: true, staffUserId: true },
    }),
  );
  const result = await updateStaff(acting, linkId, data);
  await audit(actor, centerId, {
    action: "center.staff_updated",
    targetType: "center_staff",
    targetId: linkId,
    before,
    after: { changed: Object.keys(data), ...data },
  });
  return result;
}

export async function adminRemoveStaff(actor: SessionUser, centerId: string, linkId: string) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await platformDb((tx) =>
    tx.centerStaff.findUnique({
      where: { id: linkId },
      select: { id: true, role: true, title: true, removedAt: true, staffUserId: true },
    }),
  );
  const result = await removeStaff(acting, linkId);
  await audit(actor, centerId, {
    action: "center.staff_removed",
    targetType: "center_staff",
    targetId: linkId,
    before,
    after: { removed: true },
  });
  return result;
}

export async function adminResendStaffInvite(
  actor: SessionUser,
  centerId: string,
  linkId: string,
  opts: { locale?: "ar" | "en" } = {},
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const result = await resendStaffInvite(acting, linkId, opts.locale ?? "ar");
  await audit(actor, centerId, {
    action: "center.staff_invite_resent",
    targetType: "center_staff",
    targetId: linkId,
    before: null,
    after: { resent: true },
  });
  return result;
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
  const result = await inviteCenterAdmin(acting, body);
  await audit(actor, centerId, {
    action: "center.admin_invited",
    targetType: "center",
    targetId: centerId,
    before: null,
    after: { email: body.email, existingUser: result.existingUser },
  });
  return result;
}

export async function adminRemoveCenterAdmin(
  actor: SessionUser,
  centerId: string,
  userId: string,
) {
  const { acting } = await superadminAsCenter(actor, centerId);
  const before = await snapshotUser(userId);
  const result = await removeCenterAdmin(acting, userId, null);
  await audit(actor, centerId, {
    action: "center.admin_removed",
    targetType: "user",
    targetId: userId,
    before: { admin: before },
    after: { removed: true },
  });
  return result;
}
