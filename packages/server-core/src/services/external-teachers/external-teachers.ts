// =============================================================================
// OFF-SYSTEM ("EXTERNAL") TEACHERS — the record, its ownership gate, and the
// two conversions.
//
// THE MODEL, and why it is not a new table.
//
// An external teacher is a `users` row (role=teacher, status='shell',
// password_hash NULL) whose TeacherProfile carries system_status='external'.
// Every operational table in this codebase already keys on the teacher's USER
// id — courses.teacher_id, sessions.teacher_id, subscriptions.teacher_id,
// session_settlements.teacher_id, transactions.from_entity_id — so an external
// teacher slots into the whole platform without a single one of them changing.
//
// Three consequences fall out of that choice, and each is a requirement:
//
//   1. NO LOGIN, using the door that already exists. `status='shell'` with no
//      password hash is refused by both www sign-in doors today. There is no
//      second gate to keep in sync — the same reasoning as ONE SUSPENSION
//      MECHANISM in CLAUDE.md.
//
//   2. CONVERSION LOSES NOTHING, BY CONSTRUCTION. Joining the platform flips
//      one column on the SAME user id. No row is copied, re-pointed or
//      re-parented, so there is no step at which history could be dropped. The
//      journal row this module writes is not the migration — it is the evidence
//      that there was nothing to migrate.
//
//   3. READ-ONLY IS EXPRESSIBLE. `access_level` on the profile is the tier the
//      route layer enforces in one place (assertTeacherActorMethodAllowed), the
//      same shape as the center_accountant read-only tier.
//
// OWNERSHIP. teacher_profiles has no center_id and therefore no RLS policy, so
// this module NEVER leans on row-level security for the teacher record. Every
// entry point goes through `assertManagedExternalTeacher`, which demands BOTH
// facts: the profile is managed by this center, AND a live affiliation exists.
// One gate, stated once.
// =============================================================================

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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

/**
 * Everything currently attached to a teacher, counted in ONE place.
 *
 * Used twice, and the second use is the point: the conversion journal freezes
 * this snapshot inside the same transaction as the status flip, so "the
 * conversion preserved the history" is a claim anyone can re-check later
 * against the live counts instead of a promise in a comment.
 */
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

/**
 * THE ownership gate. A center may touch a teacher record only when BOTH hold:
 *   - the profile names this center as its manager, and
 *   - an affiliation row still links them (any status but `removed`, so a
 *     soft-removed teacher can still be READ and restored).
 *
 * Demanding both is deliberate. The profile pointer alone would survive a
 * removal; the affiliation alone would let any affiliated center edit a teacher
 * another center created. Neither fact is sufficient, so neither is trusted on
 * its own.
 */
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
  // A non-owner learns nothing about whether the teacher exists.
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

/** One shape for every audit row this feature writes. */
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

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateExternalTeacherInput = {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  bio?: string | null;
  subjects?: string[];
  qualifications?: string | null;
  lessonPrice?: number | null;
  /** Flat piasters the center takes per lesson (the legacy no-room split). */
  centerShare?: number | null;
};

/**
 * Register a teacher who will never log in.
 *
 * The guards are about not silently forking a person into two records:
 *   - an ACTIVE account on that phone/email means the person is already on the
 *     platform. Creating a shell beside it would split their history in two, so
 *     this refuses and points at the collaboration request, which is the path
 *     that connects a center to a real account.
 *   - a shell teacher this center already manages is a duplicate of itself.
 */
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
          // CASE-INSENSITIVE on purpose. This lookup is the thing standing
          // between one person and two records of them, and "Ahmed@x.io" is
          // the same inbox as "ahmed@x.io". Matching exactly would let a
          // capital letter fork a teacher's history in two.
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
        // SHELL + no hash: refused by every password door until (and unless)
        // the center converts them and they claim an invite.
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

    // An off-system teacher is working with the center TODAY — there is nobody
    // to accept an invitation, so the affiliation is born `active`. The expiry
    // column is required by the model and meaningless here, so it is set far
    // out rather than left to imply a pending invite that will never arrive.
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

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type TeacherListFilters = {
  /** `external` | `enrolled` | omitted = BOTH, which is the default view. */
  systemStatus?: TeacherSystemStatus | null;
  q?: string | null;
  includeRemoved?: boolean;
};

/**
 * The center's teachers — off-system and on-platform TOGETHER by default.
 *
 * Combining them is the whole point of the feature: a center that has to look
 * in two places does not have one picture. `systemStatus` narrows it only when
 * the operator explicitly asks.
 */
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
          ...(filters.q ? { name: { contains: filters.q, mode: "insensitive" as const } } : {}),
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
    const userMap = new Map(users.map((u) => [u.id, u]));
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
        // Default-enrolled: a teacher with no profile row predates this feature
        // and is by definition an on-platform teacher, never an off-system one.
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
          // "Invite sent, not claimed yet" — only meaningful mid-conversion.
          pendingClaim: systemStatus === "enrolled" && u.passwordHash === null,
          createdAt: a.createdAt,
        };
      });

    if (!filters.systemStatus) return rows;
    return rows.filter((r) => r.systemStatus === filters.systemStatus);
  });
}

/** One off-system teacher plus what is attached to them right now. */
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

// ---------------------------------------------------------------------------
// Update / soft-remove / restore
// ---------------------------------------------------------------------------

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

/**
 * SOFT removal only — there is no hard-delete path for a teacher anywhere in
 * this module, and that is not a policy note, it is the absence of a code path.
 * A teacher who taught a single settled lesson sits in the immutable ledger
 * forever; deleting their row would leave those money entries pointing at
 * nothing.
 *
 * Removing ends the affiliation and puts the account beyond use
 * (`status='deleted'` + `deleted_at`), which is what the platform already means
 * by a removed account. Their courses, attendance, grades and money are all
 * left exactly where they are — `restoreExternalTeacher` brings the teacher
 * back to the same records.
 */
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
      // Recorded so the reversal is verifiable: restore must land on the same
      // numbers.
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
    // Back to the state an external teacher lives in: a shell with no password.
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

// ---------------------------------------------------------------------------
// Conversion — external <-> enrolled
// ---------------------------------------------------------------------------

export type ConversionResult = {
  teacherId: string;
  fromStatus: TeacherSystemStatus;
  toStatus: TeacherSystemStatus;
  /** Counts frozen inside the same transaction as the flip. */
  recordsPreserved: ExternalTeacherRecords;
  invite: { link: string; expiresAt: Date; email: DeliveryResult } | null;
};

/**
 * The teacher decided to join. Flip the record and invite them in.
 *
 * WHAT MOVES: nothing. The teacher keeps the user id they have had since the
 * center first typed them in, so every course, session, attendance row, grade,
 * payment and ledger entry stays attached with no write at all. The journal row
 * records the counts observed in this very transaction, so the claim is
 * checkable rather than asserted.
 *
 * The invite is the PROVEN claim kernel (invite_tokens + the better-auth
 * invite-token plugin, five gates) — not a teacher-specific login path. It is
 * issued after the transaction commits because its live-link gate reads the
 * committed `enrolled` status.
 */
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
      // An account with no address cannot be invited, and an account nobody can
      // reach is not "on the platform" — so this is refused up front rather than
      // producing a teacher who is `enrolled` and permanently locked out.
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
          // Joining restores full control of their own records.
          accessLevel: "full",
        },
      });
      // The account state after joining:
      //   - has a password already (they were on the platform before and were
      //     taken off-system) -> back to `active`, they can sign in again;
      //   - no password yet -> `shell`, and the invite below is what turns that
      //     into an account. `enrolled` describes the arrangement; the password
      //     door still decides who actually gets in.
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

/**
 * The other direction: a teacher who WAS on the platform stops using it, and
 * the center takes data entry back over.
 *
 * ACCESS IS CLOSED WITH THE MECHANISM THAT ALREADY EXISTS. Off-system means no
 * login — if the teacher could still sign in and write, two parties would be
 * entering the same records and neither would know which is authoritative. So
 * this sets `users.status`, which is the platform's ONE account-disabling gate:
 * `sessionRevocationExtension` bumps `token_version` in the same statement and
 * the `users_revoke_sessions` DB trigger deletes their live sessions, so the
 * next request is unauthenticated. No new gate, nothing to keep in sync — the
 * same reasoning as ONE SUSPENSION MECHANISM.
 *
 * `access_level` is deliberately NOT written here. It is the model's hook for a
 * future "the center let them look but not touch", and it stays at its default
 * until that is actually built and enforced — a column that claims a
 * restriction nothing enforces is worse than no column.
 *
 * Any outstanding invite dies with the flip too, because the claim endpoint's
 * live-link gate for `teacher_invite` demands system_status='enrolled'.
 */
export async function convertToExternal(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  input: { reason: string },
): Promise<ConversionResult> {
  const centerId = centerOf(actor.acting);
  const reason = input.reason?.trim();
  if (!reason) throw new BusinessRuleError("A reason is required");

  // PLATFORM CONTEXT, deliberately — and this is not a shortcut, it is the only
  // way the question below can be answered. "Does this teacher also work with
  // ANOTHER center?" is inherently cross-tenant, and under `scopedDb` the RLS
  // policy on center_teacher_affiliations hides exactly the rows that would say
  // yes, so the guard would pass every time. Nothing is loosened by it: every
  // query here still narrows on `centerId` explicitly, which is this module's
  // stated posture (see assertManagedExternalTeacher) rather than something
  // left to row-level security.
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
    // A teacher working with several centers cannot be taken off-system by one
    // of them: the others would silently lose the person who writes their
    // records. That is a conversation between centers, not a button.
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
        // The center taking over data entry is the center responsible for the
        // records from now on.
        managedByCenterId: centerId,
      },
    });

    // Close the login. See the doc comment: this is the platform's existing
    // account gate, and touching `status` is what fires session revocation.
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

/**
 * Re-send the join invite. Refused once the teacher has a password: that would
 * be a center-controlled password-reset door on someone else's account — the
 * same rule the assistant and staff invites already hold.
 */
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

  // Audited WITHOUT the token — invite_tokens holds only its hash, and an audit
  // row is not a place to put a live credential.
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

  // The link is returned so the center can hand it over in person when the mail
  // lands in spam — an invite in a junk folder must not strand a teacher.
  return { link, expiresAt, email };
}
