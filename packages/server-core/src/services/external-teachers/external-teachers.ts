import {
  literalFragments,
  matchesSearchTerms,
  narrowFragments,
  searchTerms,
} from "@repo/database/search-text";

import type { Prisma, TeacherSystemStatus } from "@repo/database";
import { platformDb, scopedDb, type TenantTx } from "../../db/scope";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { teacherInviteEmail } from "../../mail/templates";
import { claimLink, issueInvite } from "../invites/invite-token";
import {
  deliverInviteEmail,
  inviteExpiryDays,
  type DeliveryResult,
} from "../invites/deliver";

function centerOf(acting: SessionUser): string {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return acting.centerId;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const v = value?.toLowerCase().trim();
  return v ? v : null;
}

function normalizePhone(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export type ExternalTeacherRecords = {
  courses: number;
  sessions: number;
  enrollments: number;
  attendance: number;
  grades: number;
  payments: number;
  transactions: number;
  subscriptions: number;
};

export async function countTeacherRecords(
  tx: TenantTx,
  teacherId: string,
): Promise<ExternalTeacherRecords> {
  const courseIds = (
    await tx.course.findMany({ where: { teacherId }, select: { id: true } })
  ).map((c) => c.id);

  const [sessions, enrollments, attendance, grades, payments, transactions, subscriptions] =
    await Promise.all([
      tx.session.count({ where: { teacherId } }),
      courseIds.length
        ? tx.enrollment.count({ where: { courseId: { in: courseIds } } })
        : Promise.resolve(0),
      courseIds.length
        ? tx.attendanceRecord.count({ where: { courseId: { in: courseIds } } })
        : Promise.resolve(0),
      tx.grade.count({ where: { teacherId } }),
      courseIds.length
        ? tx.payment.count({ where: { courseId: { in: courseIds } } })
        : Promise.resolve(0),
      tx.transaction.count({
        where: { OR: [{ fromEntityId: teacherId }, { toEntityId: teacherId }] },
      }),
      tx.subscription.count({ where: { teacherId } }),
    ]);

  return {
    courses: courseIds.length,
    sessions,
    enrollments,
    attendance,
    grades,
    payments,
    transactions,
    subscriptions,
  };
}

export async function assertManagedExternalTeacher(
  tx: TenantTx,
  centerId: string,
  teacherId: string,
  opts?: { requireExternal?: boolean; allowRemoved?: boolean },
) {
  const profile = await tx.teacherProfile.findUnique({
    where: { userId: teacherId },
    select: {
      id: true,
      systemStatus: true,
      accessLevel: true,
      managedByCenterId: true,
      dataSource: true,
      bio: true,
      subjects: true,
      qualifications: true,
      experienceYears: true,
      lessonPrice: true,
      walletBalance: true,
      attendanceMode: true,
    },
  });
  if (!profile || profile.managedByCenterId !== centerId) {
    throw new NotFoundError("Teacher not found");
  }

  const affiliation = await tx.centerTeacherAffiliation.findFirst({
    where: {
      centerId,
      teacherId,
      ...(opts?.allowRemoved ? {} : { status: { not: "removed" as const } }),
    },
    orderBy: { createdAt: "desc" },
  });
  if (!affiliation) throw new NotFoundError("Teacher not found");

  if (opts?.requireExternal && profile.systemStatus !== "external") {
    throw new BusinessRuleError(
      "This teacher is on the platform — they manage their own records",
    );
  }

  const user = await tx.user.findUnique({
    where: { id: teacherId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      passwordHash: true,
      deletedAt: true,
    },
  });
  if (!user) throw new NotFoundError("Teacher not found");

  return { profile, affiliation, user };
}

export async function writeExternalTeacherAudit(
  tx: TenantTx,
  input: {
    action: string;
    actorId: string;
    onBehalfOf?: string | null;
    centerId: string;
    targetType: string;
    targetId: string;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
  },
) {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      centerId: input.centerId,
      onBehalfOf: input.onBehalfOf ?? null,
      beforeState: input.before ?? undefined,
      afterState: input.after ?? undefined,
    },
  });
}

export type CreateExternalTeacherInput = {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  bio?: string | null;
  subjects?: string[];
  qualifications?: string | null;
  lessonPrice?: number | null;
  centerShare?: number | null;
};

export async function createExternalTeacher(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  input: CreateExternalTeacherInput,
) {
  const centerId = centerOf(actor.acting);
  const name = input.fullName.trim();
  if (!name) throw new BusinessRuleError("Teacher name is required");

  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);

  return scopedDb(actor.acting, async (tx) => {
    const clash = await tx.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
      select: { id: true, role: true, status: true, name: true },
    });

    if (clash) {
      if (clash.role !== "teacher") {
        throw new ConflictError(
          "This phone or email already belongs to an account with a different role",
        );
      }
      if (clash.status !== "shell") {
        throw new ConflictError(
          "This teacher is already on the platform — send them a collaboration request instead",
        );
      }
      const managed = await tx.teacherProfile.findUnique({
        where: { userId: clash.id },
        select: { managedByCenterId: true },
      });
      if (managed?.managedByCenterId === centerId) {
        throw new ConflictError("You already have an off-system teacher with these details");
      }
      throw new ConflictError(
        "Another center already keeps records for this teacher",
      );
    }

    const teacherUser = await tx.user.create({
      data: {
        name,
        email,
        phone,
        role: "teacher",
        status: "shell",
        passwordHash: null,
      },
    });

    const profile = await tx.teacherProfile.create({
      data: {
        userId: teacherUser.id,
        systemStatus: "external",
        accessLevel: "full",
        managedByCenterId: centerId,
        dataSource: "manual",
        bio: input.bio?.trim() || null,
        subjects: input.subjects ?? [],
        qualifications: input.qualifications?.trim() || null,
        lessonPrice: input.lessonPrice ?? null,
      },
    });

    const affiliation = await tx.centerTeacherAffiliation.create({
      data: {
        centerId,
        teacherId: teacherUser.id,
        status: "active",
        centerShare: input.centerShare ?? null,
        dataSource: "manual",
        invitedAt: new Date(),
        respondedAt: new Date(),
        expiresAt: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
      },
    });

    await writeExternalTeacherAudit(tx, {
      action: "external_teacher.created",
      actorId: actor.actorId,
      onBehalfOf: actor.onBehalfOf ?? null,
      centerId,
      targetType: "teacher",
      targetId: teacherUser.id,
      after: {
        name,
        email,
        phone,
        systemStatus: "external",
        centerShare: affiliation.centerShare,
      },
    });

    return {
      id: teacherUser.id,
      teacherId: teacherUser.id,
      name: teacherUser.name,
      email: teacherUser.email,
      phone: teacherUser.phone,
      status: teacherUser.status,
      systemStatus: profile.systemStatus,
      accessLevel: profile.accessLevel,
      dataSource: profile.dataSource,
      centerShare: affiliation.centerShare,
      affiliationId: affiliation.id,
    };
  });
}

export type TeacherListFilters = {
  systemStatus?: TeacherSystemStatus | null;
  q?: string | null;
  includeRemoved?: boolean;
};

export async function listCenterTeachers(
  acting: SessionUser,
  filters: TeacherListFilters = {},
) {
  const centerId = centerOf(acting);
  return scopedDb(acting, async (tx) => {
    const affiliations = await tx.centerTeacherAffiliation.findMany({
      where: {
        centerId,
        ...(filters.includeRemoved ? {} : { status: { not: "removed" } }),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!affiliations.length) return [];

    const teacherIds = affiliations.map((a) => a.teacherId);
    const [users, profiles] = await Promise.all([
      tx.user.findMany({
        where: {
          id: { in: teacherIds },
          ...(filters.includeRemoved ? { deletedAt: undefined } : {}),
          ...(searchTerms(filters.q ?? "").length
            ? {
                AND: narrowFragments(literalFragments(filters.q ?? ""), (f) => [
                  { name: { contains: f, mode: "insensitive" as const } },
                  { phone: { contains: f } },
                ]),
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          deletedAt: true,
          passwordHash: true,
        },
      }),
      tx.teacherProfile.findMany({
        where: { userId: { in: teacherIds } },
        select: {
          userId: true,
          systemStatus: true,
          accessLevel: true,
          managedByCenterId: true,
          dataSource: true,
          subjects: true,
          lessonPrice: true,
          walletBalance: true,
        },
      }),
    ]);
    const terms = searchTerms(filters.q ?? "");
    const matched = terms.length
      ? users.filter((u) => matchesSearchTerms([u.name, u.phone], terms))
      : users;
    const userMap = new Map(matched.map((u) => [u.id, u]));
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    const courseGroups = await tx.course.groupBy({
      by: ["teacherId"],
      where: { centerId, teacherId: { in: teacherIds }, status: "active" },
      _count: { _all: true },
    });
    const coursesByTeacher = new Map(courseGroups.map((g) => [g.teacherId, g._count._all]));

    const rows = affiliations
      .filter((a) => userMap.has(a.teacherId))
      .map((a) => {
        const u = userMap.get(a.teacherId)!;
        const p = profileMap.get(a.teacherId);
        const systemStatus: TeacherSystemStatus = p?.systemStatus ?? "enrolled";
        return {
          id: a.teacherId,
          teacherId: a.teacherId,
          name: u.name,
          email: u.email,
          phone: u.phone,
          accountStatus: u.status,
          systemStatus,
          accessLevel: p?.accessLevel ?? "full",
          dataSource: p?.dataSource ?? "system",
          managedByThisCenter: p?.managedByCenterId === centerId,
          subjects: p?.subjects ?? [],
          lessonPrice: p?.lessonPrice ?? null,
          walletBalance: p?.walletBalance ?? 0,
          coursesCount: coursesByTeacher.get(a.teacherId) ?? 0,
          centerShare: a.centerShare,
          affiliationStatus: a.status,
          removed: a.status === "removed",
          pendingClaim: systemStatus === "enrolled" && u.passwordHash === null,
          createdAt: a.createdAt,
        };
      });

    if (!filters.systemStatus) return rows;
    return rows.filter((r) => r.systemStatus === filters.systemStatus);
  });
}

export async function getExternalTeacher(acting: SessionUser, teacherId: string) {
  const centerId = centerOf(acting);
  return scopedDb(acting, async (tx) => {
    const { profile, affiliation, user } = await assertManagedExternalTeacher(
      tx,
      centerId,
      teacherId,
      { allowRemoved: true },
    );

    const [records, history] = await Promise.all([
      countTeacherRecords(tx, teacherId),
      tx.teacherSystemStatusChange.findMany({
        where: { teacherId, centerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return {
      id: user.id,
      teacherId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      accountStatus: user.status,
      pendingClaim: user.passwordHash === null,
      systemStatus: profile.systemStatus,
      accessLevel: profile.accessLevel,
      dataSource: profile.dataSource,
      bio: profile.bio,
      subjects: profile.subjects,
      qualifications: profile.qualifications,
      experienceYears: profile.experienceYears,
      lessonPrice: profile.lessonPrice,
      walletBalance: profile.walletBalance,
      attendanceMode: profile.attendanceMode,
      centerShare: affiliation.centerShare,
      affiliationStatus: affiliation.status,
      removed: affiliation.status === "removed",
      records,
      statusHistory: history,
    };
  });
}

export type UpdateExternalTeacherInput = {
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  bio?: string | null;
  subjects?: string[];
  qualifications?: string | null;
  lessonPrice?: number | null;
  centerShare?: number | null;
};

export async function updateExternalTeacher(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  input: UpdateExternalTeacherInput,
) {
  const centerId = centerOf(actor.acting);

  return scopedDb(actor.acting, async (tx) => {
    const { profile, affiliation, user } = await assertManagedExternalTeacher(
      tx,
      centerId,
      teacherId,
      { requireExternal: true },
    );

    const before = {
      name: user.name,
      email: user.email,
      phone: user.phone,
      subjects: profile.subjects,
      lessonPrice: profile.lessonPrice,
      centerShare: affiliation.centerShare,
    };

    const userUpdate: Prisma.UserUpdateInput = {};
    if (input.fullName !== undefined) {
      const name = input.fullName.trim();
      if (!name) throw new BusinessRuleError("Teacher name cannot be empty");
      userUpdate.name = name;
    }
    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      if (email) {
        const taken = await tx.user.findFirst({
          where: { email, id: { not: teacherId }, deletedAt: null },
          select: { id: true },
        });
        if (taken) throw new ConflictError("Email already in use");
      }
      userUpdate.email = email;
    }
    if (input.phone !== undefined) {
      const phone = normalizePhone(input.phone);
      if (phone) {
        const taken = await tx.user.findFirst({
          where: { phone, id: { not: teacherId }, deletedAt: null },
          select: { id: true },
        });
        if (taken) throw new ConflictError("Phone already in use");
      }
      userUpdate.phone = phone;
    }
    if (Object.keys(userUpdate).length) {
      await tx.user.update({ where: { id: teacherId }, data: userUpdate });
    }

    const profileUpdate: Prisma.TeacherProfileUpdateInput = {};
    if (input.bio !== undefined) profileUpdate.bio = input.bio?.trim() || null;
    if (input.subjects !== undefined) profileUpdate.subjects = input.subjects;
    if (input.qualifications !== undefined) {
      profileUpdate.qualifications = input.qualifications?.trim() || null;
    }
    if (input.lessonPrice !== undefined) profileUpdate.lessonPrice = input.lessonPrice;
    if (Object.keys(profileUpdate).length) {
      await tx.teacherProfile.update({ where: { userId: teacherId }, data: profileUpdate });
    }

    if (input.centerShare !== undefined) {
      if (input.centerShare !== null && input.centerShare < 0) {
        throw new BusinessRuleError("Center share cannot be negative");
      }
      await tx.centerTeacherAffiliation.update({
        where: { id: affiliation.id },
        data: { centerShare: input.centerShare },
      });
    }

    const after = await tx.user.findUnique({
      where: { id: teacherId },
      select: { name: true, email: true, phone: true },
    });

    await writeExternalTeacherAudit(tx, {
      action: "external_teacher.updated",
      actorId: actor.actorId,
      onBehalfOf: actor.onBehalfOf ?? null,
      centerId,
      targetType: "teacher",
      targetId: teacherId,
      before,
      after: {
        ...after,
        subjects: input.subjects ?? profile.subjects,
        lessonPrice: input.lessonPrice ?? profile.lessonPrice,
        centerShare:
          input.centerShare !== undefined ? input.centerShare : affiliation.centerShare,
      },
    });

    return { updated: true as const };
  });
}

export async function removeExternalTeacher(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  reason: string,
) {
  const centerId = centerOf(actor.acting);
  if (!reason?.trim()) throw new BusinessRuleError("A reason is required");

  return scopedDb(actor.acting, async (tx) => {
    const { affiliation, profile } = await assertManagedExternalTeacher(
      tx,
      centerId,
      teacherId,
      { requireExternal: true },
    );

    const activeCourses = await tx.course.count({
      where: { centerId, teacherId, status: "active" },
    });
    if (activeCourses > 0) {
      throw new BusinessRuleError(
        "This teacher still has active groups — end or reassign them first",
      );
    }

    await tx.centerTeacherAffiliation.update({
      where: { id: affiliation.id },
      data: { status: "removed", removedAt: new Date() },
    });
    await tx.user.update({
      where: { id: teacherId },
      data: { status: "deleted", deletedAt: new Date() },
    });

    const records = await countTeacherRecords(tx, teacherId);

    await writeExternalTeacherAudit(tx, {
      action: "external_teacher.removed",
      actorId: actor.actorId,
      onBehalfOf: actor.onBehalfOf ?? null,
      centerId,
      targetType: "teacher",
      targetId: teacherId,
      before: { affiliationStatus: affiliation.status, systemStatus: profile.systemStatus },
      after: { affiliationStatus: "removed", reason: reason.trim(), recordsKept: records },
    });

    return { removed: true as const, recordsKept: records };
  });
}

export async function restoreExternalTeacher(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
) {
  const centerId = centerOf(actor.acting);

  return scopedDb(actor.acting, async (tx) => {
    const { affiliation } = await assertManagedExternalTeacher(tx, centerId, teacherId, {
      requireExternal: true,
      allowRemoved: true,
    });
    if (affiliation.status !== "removed") {
      throw new BusinessRuleError("This teacher is not removed");
    }

    await tx.centerTeacherAffiliation.update({
      where: { id: affiliation.id },
      data: { status: "active", removedAt: null },
    });
    await tx.user.update({
      where: { id: teacherId },
      data: { status: "shell", deletedAt: null },
    });

    await writeExternalTeacherAudit(tx, {
      action: "external_teacher.restored",
      actorId: actor.actorId,
      onBehalfOf: actor.onBehalfOf ?? null,
      centerId,
      targetType: "teacher",
      targetId: teacherId,
      before: { affiliationStatus: "removed" },
      after: { affiliationStatus: "active" },
    });

    return { restored: true as const };
  });
}

export type ConversionResult = {
  teacherId: string;
  fromStatus: TeacherSystemStatus;
  toStatus: TeacherSystemStatus;
  recordsPreserved: ExternalTeacherRecords;
  invite: { link: string; expiresAt: Date; email: DeliveryResult } | null;
};

export async function convertToEnrolled(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  input: { email?: string | null; reason: string; locale?: "ar" | "en" },
): Promise<ConversionResult> {
  const centerId = centerOf(actor.acting);
  const reason = input.reason?.trim();
  if (!reason) throw new BusinessRuleError("A reason is required");

  const { recordsPreserved, teacherName, teacherEmail, centerName, needsInvite } =
    await scopedDb(actor.acting, async (tx) => {
      const { profile, user } = await assertManagedExternalTeacher(
        tx,
        centerId,
        teacherId,
        { requireExternal: true },
      );

      const email = normalizeEmail(input.email) ?? user.email;
      if (!email) {
        throw new BusinessRuleError(
          "An email address is required before this teacher can join the platform",
        );
      }
      if (email !== user.email) {
        const taken = await tx.user.findFirst({
          where: { email, id: { not: teacherId }, deletedAt: null },
          select: { id: true },
        });
        if (taken) throw new ConflictError("Email already in use");
      }

      const records = await countTeacherRecords(tx, teacherId);

      await tx.teacherProfile.update({
        where: { userId: teacherId },
        data: {
          systemStatus: "enrolled",
          accessLevel: "full",
        },
      });
      await tx.user.update({
        where: { id: teacherId },
        data: {
          email,
          status: user.passwordHash !== null ? "active" : "shell",
          deletedAt: null,
        },
      });

      await tx.teacherSystemStatusChange.create({
        data: {
          teacherId,
          centerId,
          fromStatus: "external",
          toStatus: "enrolled",
          reason,
          recordsBefore: records,
          actorId: actor.actorId,
        },
      });

      await writeExternalTeacherAudit(tx, {
        action: "teacher.converted_to_enrolled",
        actorId: actor.actorId,
        onBehalfOf: actor.onBehalfOf ?? null,
        centerId,
        targetType: "teacher",
        targetId: teacherId,
        before: { systemStatus: "external", accessLevel: profile.accessLevel },
        after: { systemStatus: "enrolled", accessLevel: "full", reason, records },
      });

      const center = await tx.center.findUnique({
        where: { id: centerId },
        select: { name: true },
      });

      return {
        recordsPreserved: records,
        teacherName: user.name,
        teacherEmail: email,
        centerName: center?.name ?? "",
        needsInvite: user.passwordHash === null,
      };
    });

  const invite = needsInvite
    ? await sendTeacherInvite({
        teacherId,
        teacherName,
        email: teacherEmail,
        centerId,
        centerName,
        actorId: actor.actorId,
        locale: input.locale ?? "ar",
      })
    : null;

  return {
    teacherId,
    fromStatus: "external",
    toStatus: "enrolled",
    recordsPreserved,
    invite,
  };
}

export async function convertToExternal(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  input: { reason: string },
): Promise<ConversionResult> {
  const centerId = centerOf(actor.acting);
  const reason = input.reason?.trim();
  if (!reason) throw new BusinessRuleError("A reason is required");

  const recordsPreserved = await platformDb(async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: { centerId, teacherId, status: "active" },
      select: { id: true },
    });
    if (!affiliation) throw new NotFoundError("Teacher not found");

    const profile = await tx.teacherProfile.findUnique({
      where: { userId: teacherId },
      select: { systemStatus: true, accessLevel: true, managedByCenterId: true },
    });
    if (!profile) throw new NotFoundError("Teacher not found");
    if (profile.systemStatus === "external") {
      throw new BusinessRuleError("This teacher is already off-system");
    }
    const otherCenters = await tx.centerTeacherAffiliation.count({
      where: { teacherId, status: "active", NOT: { centerId } },
    });
    if (otherCenters > 0) {
      throw new BusinessRuleError(
        "This teacher also works with another center on the platform and cannot be taken off-system here",
      );
    }

    const records = await countTeacherRecords(tx, teacherId);
    const account = await tx.user.findUnique({
      where: { id: teacherId },
      select: { status: true },
    });

    await tx.teacherProfile.update({
      where: { userId: teacherId },
      data: {
        systemStatus: "external",
        managedByCenterId: centerId,
      },
    });

    if (account && account.status === "active") {
      await tx.user.update({
        where: { id: teacherId },
        data: { status: "suspended" },
      });
    }

    await tx.teacherSystemStatusChange.create({
      data: {
        teacherId,
        centerId,
        fromStatus: "enrolled",
        toStatus: "external",
        reason,
        recordsBefore: records,
        actorId: actor.actorId,
      },
    });

    await writeExternalTeacherAudit(tx, {
      action: "teacher.converted_to_external",
      actorId: actor.actorId,
      onBehalfOf: actor.onBehalfOf ?? null,
      centerId,
      targetType: "teacher",
      targetId: teacherId,
      before: { systemStatus: "enrolled", accountStatus: account?.status ?? null },
      after: {
        systemStatus: "external",
        accountStatus: account?.status === "active" ? "suspended" : (account?.status ?? null),
        reason,
        records,
      },
    });

    return records;
  }, { actorId: actor.actorId });

  return {
    teacherId,
    fromStatus: "enrolled",
    toStatus: "external",
    recordsPreserved,
    invite: null,
  };
}

export async function resendTeacherInvite(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  locale: "ar" | "en" = "ar",
) {
  const centerId = centerOf(actor.acting);

  const { name, email, centerName } = await scopedDb(actor.acting, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: { centerId, teacherId, status: "active" },
      select: { id: true },
    });
    if (!affiliation) throw new NotFoundError("Teacher not found");

    const profile = await tx.teacherProfile.findUnique({
      where: { userId: teacherId },
      select: { systemStatus: true },
    });
    if (!profile || profile.systemStatus !== "enrolled") {
      throw new BusinessRuleError("This teacher has not been converted to the platform yet");
    }

    const user = await tx.user.findUnique({
      where: { id: teacherId },
      select: { name: true, email: true, passwordHash: true },
    });
    if (!user) throw new NotFoundError("Teacher not found");
    if (user.passwordHash !== null) {
      throw new BusinessRuleError("This teacher has already set a password");
    }
    if (!user.email) throw new BusinessRuleError("This teacher has no email address");

    const center = await tx.center.findUnique({
      where: { id: centerId },
      select: { name: true },
    });
    return { name: user.name, email: user.email, centerName: center?.name ?? "" };
  });

  return sendTeacherInvite({
    teacherId,
    teacherName: name,
    email,
    centerId,
    centerName,
    actorId: actor.actorId,
    locale,
  });
}

async function sendTeacherInvite(input: {
  teacherId: string;
  teacherName: string;
  email: string;
  centerId: string;
  centerName: string;
  actorId: string;
  locale: "ar" | "en";
}) {
  const { token, expiresAt } = await issueInvite({
    userId: input.teacherId,
    purpose: "teacher_invite",
    centerId: input.centerId,
    email: input.email,
    actorId: input.actorId,
  });
  const link = claimLink(token, input.locale);

  const email = await deliverInviteEmail({
    to: input.email,
    ...teacherInviteEmail({
      locale: input.locale,
      link,
      teacherName: input.teacherName,
      centerName: input.centerName,
      expiryDays: inviteExpiryDays(),
    }),
  });

  await platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "teacher.invited",
          targetType: "teacher",
          targetId: input.teacherId,
          centerId: input.centerId,
          afterState: { email: input.email, delivery: email.status },
        },
      }),
    { actorId: input.actorId },
  ).catch(() => {
    console.error("[external-teacher] invite audit write failed");
  });

  return { link, expiresAt, email };
}
