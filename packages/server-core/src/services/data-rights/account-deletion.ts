import { Prisma } from "@repo/database";
import { isMinorFromProfile } from "@repo/database/chat-minors";
import { platformDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import type { TenantTx } from "../../db/scope";
import { assertDataRightsSubject } from "./data-export";
import { parsePageLimit } from "../../validation/common";

export type DeletionOriginValue = "self" | "guardian" | "center";

const ANON_NAME = { ar: "حساب محذوف", en: "Deleted account" };

const anonymizedEmail = (userId: string) => `deleted-${userId}@anonymized.invalid`;

export function getDeletionEligibility(actor: SessionUser, subjectUserId?: string) {
  const subject = subjectUserId ?? actor.id;

  return platformDb(async (tx) => {
    const { self } = await assertDataRightsSubject(tx, actor, subject);

    const profile = await tx.studentProfile.findUnique({
      where: { userId: subject },
      select: { dateOfBirth: true, dateOfBirthVerifiedAt: true },
    });
    const isStudent = profile !== null;
    const minor = isStudent ? isMinorFromProfile(profile) : false;

    const pending = await tx.deletionRequest.findFirst({
      where: { userId: subject, status: "pending" },
      select: { id: true, requestedAt: true, origin: true, reason: true },
    });

    return {
      subjectUserId: subject,
      isMinor: minor,
      canRequestSelf: self && !minor,
      canRequestAsGuardian: !self,
      pending,
    };
  });
}

export function requestAccountDeletion(
  actor: SessionUser,
  input: { subjectUserId?: string; reason?: string },
) {
  const subject = input.subjectUserId ?? actor.id;

  return platformDb(async (tx) => {
    const { self } = await assertDataRightsSubject(tx, actor, subject);

    const profile = await tx.studentProfile.findUnique({
      where: { userId: subject },
      select: { dateOfBirth: true, dateOfBirthVerifiedAt: true },
    });
    const minor = profile !== null && isMinorFromProfile(profile);

    if (self && minor) {
      throw new BusinessRuleError(
        "A minor's account can only be deleted at the request of their approved guardian",
      );
    }

    const existing = await tx.deletionRequest.findFirst({
      where: { userId: subject, status: "pending" },
      select: { id: true },
    });
    if (existing) throw new BusinessRuleError("A deletion request is already under review");

    const subjectUser = await tx.user.findUnique({
      where: { id: subject },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!subjectUser || subjectUser.deletedAt) throw new NotFoundError("Account not found");

    const created = await tx.deletionRequest.create({
      data: {
        userId: subject,
        centerId: null,
        origin: self ? "self" : "guardian",
        requestedBy: actor.id,
        reason: input.reason?.trim() || "Data-subject erasure request (Law 151/2020)",
        requesterNote: input.reason?.trim() || null,
        status: "pending",
      },
      select: { id: true, status: true, requestedAt: true, origin: true },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "account_deletion.requested",
        targetType: "user",
        targetId: subject,
        afterState: { requestId: created.id, origin: created.origin } as never,
        onBehalfOf: null,
      },
    });

    return created;
  });
}

export function withdrawAccountDeletion(actor: SessionUser, requestId: string) {
  return platformDb(async (tx) => {
    const row = await tx.deletionRequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, status: true },
    });
    if (!row) throw new NotFoundError("Deletion request not found");
    await assertDataRightsSubject(tx, actor, row.userId);

    if (row.status !== "pending") {
      throw new BusinessRuleError(`This request is already ${row.status}`);
    }

    const updated = await tx.deletionRequest.update({
      where: { id: requestId },
      data: { status: "cancelled", reviewedAt: new Date(), reviewedBy: actor.id },
      select: { id: true, status: true },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "account_deletion.withdrawn",
        targetType: "user",
        targetId: row.userId,
        afterState: { requestId } as never,
        onBehalfOf: null,
      },
    });

    return updated;
  });
}

export function getMyDeletionRequests(actor: SessionUser, subjectUserId?: string) {
  const subject = subjectUserId ?? actor.id;
  return platformDb(async (tx) => {
    await assertDataRightsSubject(tx, actor, subject);
    return tx.deletionRequest.findMany({
      where: { userId: subject },
      orderBy: { requestedAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        origin: true,
        requestedAt: true,
        reviewedAt: true,
        reviewNote: true,
        anonymizedAt: true,
      },
    });
  });
}

async function scrubPersonalData(tx: TenantTx, userId: string, locale: "ar" | "en") {
  await tx.user.update({
    where: { id: userId },
    data: {
      name: ANON_NAME[locale],
      email: anonymizedEmail(userId),
      phone: null,
      image: null,
      status: "deleted",
      deletedAt: new Date(),
      tokenVersion: { increment: 1 },
    },
  });

  await tx.studentProfile.updateMany({
    where: { userId },
    data: {
      fullName: ANON_NAME[locale],
      phone: null,
      guardianEmail: null,
      guardianPhone: null,
      guardianEmailAddedAt: null,
      guardianEmailAddedBy: null,
      guardianContactDueAt: null,
      dateOfBirth: null,
      dateOfBirthVerifiedAt: null,
      dateOfBirthVerifiedBy: null,
    },
  });

  await tx.teacherProfile.updateMany({ where: { userId }, data: { bio: null } });

  await tx.dataExportRequest.updateMany({
    where: { userId, status: { in: ["pending", "processing", "ready"] } },
    data: { status: "expired", payload: Prisma.DbNull, byteSize: null },
  });
}

export type DeletionQueueFilters = {
  status?: string;
  origin?: string;
  page?: string;
  limit?: string;
};

const STATUSES = new Set(["pending", "approved", "rejected", "cancelled"]);
const ORIGINS = new Set(["self", "guardian", "center"]);

export function listDeletionQueue(actor: SessionUser, filters: DeletionQueueFilters) {
  if (actor.role !== "super_admin") throw new ForbiddenError();

  const { page, limit } = parsePageLimit(filters, 25);

  return platformDb(async (tx) => {
    const where = {
      ...(filters.status && STATUSES.has(filters.status)
        ? { status: filters.status as "pending" | "approved" | "rejected" | "cancelled" }
        : {}),
      ...(filters.origin && ORIGINS.has(filters.origin)
        ? { origin: filters.origin as DeletionOriginValue }
        : {}),
    };

    const [rows, total, pendingCount] = await Promise.all([
      tx.deletionRequest.findMany({
        where,
        orderBy: { requestedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.deletionRequest.count({ where }),
      tx.deletionRequest.count({ where: { status: "pending" } }),
    ]);

    const ids = [
      ...new Set(
        [...rows.map((r) => r.userId), ...rows.map((r) => r.requestedBy)].filter(Boolean) as string[],
      ),
    ];
    const people = ids.length
      ? await tx.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true, role: true, status: true },
        })
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));

    return {
      data: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        subject: byId.get(r.userId) ?? null,
        requestedBy: r.requestedBy,
        requestedByName: r.requestedBy ? (byId.get(r.requestedBy)?.name ?? null) : null,
        origin: r.origin,
        status: r.status,
        reason: r.reason,
        requesterNote: r.requesterNote,
        reviewNote: r.reviewNote,
        requestedAt: r.requestedAt,
        reviewedAt: r.reviewedAt,
        anonymizedAt: r.anonymizedAt,
        centerId: r.centerId,
      })),
      total,
      pendingCount,
      page,
      limit,
    };
  });
}

export function approveDeletion(
  actor: SessionUser,
  requestId: string,
  reviewNote: string,
  locale: "ar" | "en" = "ar",
) {
  if (actor.role !== "super_admin") throw new ForbiddenError();
  const note = reviewNote?.trim();
  if (!note) throw new BusinessRuleError("A review note is required to approve a deletion");

  return platformDb(async (tx) => {
    const req = await tx.deletionRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundError("Deletion request not found");
    if (req.status !== "pending") throw new BusinessRuleError(`Request already ${req.status}`);

    const before = await tx.user.findUnique({
      where: { id: req.userId },
      select: { id: true, role: true, status: true },
    });
    if (!before) throw new NotFoundError("Account not found");

    await scrubPersonalData(tx, req.userId, locale);

    const updated = await tx.deletionRequest.update({
      where: { id: requestId },
      data: {
        status: "approved",
        reviewedBy: actor.id,
        reviewedAt: new Date(),
        reviewNote: note,
        anonymizedAt: new Date(),
        anonymizedBy: actor.id,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "account_deletion.executed",
        targetType: "user",
        targetId: req.userId,
        beforeState: { status: before.status, role: before.role } as never,
        afterState: {
          status: "deleted",
          anonymized: true,
          requestId,
          origin: req.origin,
          note,
          personalDataRetained: false,
          ledgerRetained: true,
        } as never,
        onBehalfOf: null,
      },
    });

    return updated;
  });
}

export function rejectDeletion(actor: SessionUser, requestId: string, reviewNote: string) {
  if (actor.role !== "super_admin") throw new ForbiddenError();
  const note = reviewNote?.trim();
  if (!note) {
    throw new BusinessRuleError("A reason is required to reject a deletion request");
  }

  return platformDb(async (tx) => {
    const req = await tx.deletionRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundError("Deletion request not found");
    if (req.status !== "pending") throw new BusinessRuleError(`Request already ${req.status}`);

    const updated = await tx.deletionRequest.update({
      where: { id: requestId },
      data: {
        status: "rejected",
        reviewedBy: actor.id,
        reviewedAt: new Date(),
        reviewNote: note,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "account_deletion.rejected",
        targetType: "user",
        targetId: req.userId,
        afterState: { requestId, note } as never,
        onBehalfOf: null,
      },
    });

    return updated;
  });
}

export function anonymizeApproved(
  actor: SessionUser,
  requestId: string,
  locale: "ar" | "en" = "ar",
) {
  if (actor.role !== "super_admin") throw new ForbiddenError();

  return platformDb(async (tx) => {
    const req = await tx.deletionRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundError("Deletion request not found");
    if (req.status !== "approved") {
      throw new BusinessRuleError("Only an approved request can be anonymized");
    }
    if (req.anonymizedAt) throw new BusinessRuleError("Already anonymized");

    await scrubPersonalData(tx, req.userId, locale);

    const updated = await tx.deletionRequest.update({
      where: { id: requestId },
      data: { anonymizedAt: new Date(), anonymizedBy: actor.id },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "account_deletion.anonymized",
        targetType: "user",
        targetId: req.userId,
        afterState: { requestId, personalDataRetained: false, ledgerRetained: true } as never,
        onBehalfOf: null,
      },
    });

    return updated;
  });
}
