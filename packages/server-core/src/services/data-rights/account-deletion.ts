import { Prisma } from "@repo/database";
import { isMinorFromProfile } from "@repo/database/chat-minors";
import { platformDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import type { TenantTx } from "../../db/scope";
import { assertDataRightsSubject } from "./data-export";

// ===========================================================================
// ACCOUNT DELETION — قانون 151/2020 article 2 (erasure), reconciled with the
// accounting-retention obligations that sit on top of it.
//
// THE CENTRAL FACT, AND WHY IT IS NOT A COMPROMISE:
//
//   The person disappears. The money does not.
//
// `transactions`, `points_ledger`, `session_settlements` and `audit_logs`
// carry REVOKE UPDATE, DELETE for the application role. This service runs as
// `edura_app` like everything else, so it COULD NOT rewrite a ledger row even
// if it were asked to — the guarantee is at the database, not in this file's
// good intentions. What it CAN do is erase the personal data those rows point
// at. The `users` row survives (soft-deleted), so every foreign reference
// still resolves; what stops existing is the name, the email, the phone, the
// guardian contact, and the date of birth.
//
// That is the correct reading of both obligations at once: an accountant can
// still reconcile the books, and nobody can tell whose books they were.
//
// FOUR RULES:
//
// 1. A MINOR'S DELETION IS GUARDIAN-INITIATED. `isMinorFromProfile` is the
//    single implementation of "is this a minor" in the codebase and it is
//    DEFAULT-MINOR — no verified DOB proving 18+ means minor. A minor cannot
//    request erasure of their own account here; an approved parent can. This
//    is protection, not paternalism: irreversible erasure requested by a
//    thirteen-year-old after an argument is not consent.
//
// 2. REQUESTING IS NOT DELETING. The request enters a queue a human reviews.
//    The subject can withdraw it until then. Nothing about the account changes
//    while it waits.
//
// 3. APPROVAL AND ERASURE ARE ONE TRANSACTION. A soft-delete that commits
//    without its scrub leaves an account that is disabled but still named —
//    the worst of both states. They commit together, or neither does.
//
// 4. SUSPENSION REUSES C-03. The status write passes through
//    `sessionRevocationExtension`, so `token_version` bumps and the
//    `users_revoke_sessions` trigger deletes live sessions in the same
//    statement. No second mechanism.
// ===========================================================================

export type DeletionOriginValue = "self" | "guardian" | "center";

/** What a scrubbed field becomes. Deterministic, and obviously not a name. */
const ANON_NAME = { ar: "حساب محذوف", en: "Deleted account" };

/**
 * Uniqueness survives erasure. `users.email` and `users.phone` are UNIQUE, so
 * blanking every deleted account to the same value would collide on the second
 * one. The id is already unique and is already in every ledger row, so it is
 * the natural discriminator — and `.invalid` is the RFC 2606 reserved TLD,
 * which can never be registered and therefore can never be delivered to.
 */
const anonymizedEmail = (userId: string) => `deleted-${userId}@anonymized.invalid`;

// ---------------------------------------------------------------------------
// Requesting
// ---------------------------------------------------------------------------

/**
 * Whether the subject may raise their own request, or needs a guardian.
 * Exposed so the UI can say WHY the button is absent rather than just hiding it.
 */
export function getDeletionEligibility(actor: SessionUser, subjectUserId?: string) {
  const subject = subjectUserId ?? actor.id;

  return platformDb(async (tx) => {
    const { self } = await assertDataRightsSubject(tx, actor, subject);

    const profile = await tx.studentProfile.findUnique({
      where: { userId: subject },
      select: { dateOfBirth: true, dateOfBirthVerifiedAt: true },
    });
    // A non-student has no student profile; `isMinorFromProfile(null)` is
    // DEFAULT-MINOR, which would be wrong for a teacher. Minority is a
    // student-profile property, so only a student can be a minor here.
    const isStudent = profile !== null;
    const minor = isStudent ? isMinorFromProfile(profile) : false;

    const pending = await tx.deletionRequest.findFirst({
      where: { userId: subject, status: "pending" },
      select: { id: true, requestedAt: true, origin: true, reason: true },
    });

    return {
      subjectUserId: subject,
      isMinor: minor,
      // A minor may not erase themselves; their approved guardian may.
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

    // `center_id` decides WHICH DESK reviews it. A self- or guardian-raised
    // request is a platform matter, so it is left NULL and lands in the back
    // office queue — the center is not the data controller of somebody's
    // decision to leave the platform.
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

/** The subject (or their guardian) withdraws a request still under review. */
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
      // `cancelled`, never `rejected`. Rejection is a decision someone else
      // made about you; conflating them misreports a data-rights outcome.
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

/** The subject's own view of where their request stands. */
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

// ---------------------------------------------------------------------------
// THE SCRUB
// ---------------------------------------------------------------------------

/**
 * Erase the personal data on one account, in place.
 *
 * Called only from inside an approving transaction. Every write below targets
 * a column holding a NAME, an ADDRESS or a BODILY FACT. Nothing here touches
 * an amount, a receipt, a settlement or an audit row — and it could not, since
 * those tables are REVOKEd for this role.
 */
async function scrubPersonalData(tx: TenantTx, userId: string, locale: "ar" | "en") {
  await tx.user.update({
    where: { id: userId },
    data: {
      name: ANON_NAME[locale],
      email: anonymizedEmail(userId),
      // Phone is UNIQUE and nullable — NULL is both unique-safe and the
      // honest representation of "we no longer hold a number for this person".
      phone: null,
      image: null,
      status: "deleted",
      deletedAt: new Date(),
      // C-03: this write passes through sessionRevocationExtension, so
      // token_version bumps and the users_revoke_sessions trigger deletes the
      // account's live sessions in the same statement.
      tokenVersion: { increment: 1 },
    },
  });

  // The student profile carries the densest personal data on the platform:
  // the child's real name, their guardian's contact details, their birthday.
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

  // A teacher's bio is free text they wrote about themselves.
  await tx.teacherProfile.updateMany({ where: { userId }, data: { bio: null } });

  // Any export payload still sitting around is a complete copy of exactly the
  // data we were just asked to erase. It goes with it.
  await tx.dataExportRequest.updateMany({
    where: { userId, status: { in: ["pending", "processing", "ready"] } },
    // Prisma.DbNull — `undefined` would mean "leave it alone", which on this
    // particular column would leave a full copy of the erased data behind.
    data: { status: "expired", payload: Prisma.DbNull, byteSize: null },
  });
}

// ---------------------------------------------------------------------------
// Review (back office)
// ---------------------------------------------------------------------------

export type DeletionQueueFilters = {
  status?: string;
  origin?: string;
  page?: string;
  limit?: string;
};

const STATUSES = new Set(["pending", "approved", "rejected", "cancelled"]);
const ORIGINS = new Set(["self", "guardian", "center"]);

/** The platform-wide queue. Unlike the center queue, this one is not scoped. */
export function listDeletionQueue(actor: SessionUser, filters: DeletionQueueFilters) {
  if (actor.role !== "super_admin") throw new ForbiddenError();

  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit ?? "25", 10) || 25));

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

/**
 * Approve: disable the account and erase its personal data, in ONE
 * transaction. A partial commit here would produce an account that is dead but
 * still carries a name — the state the whole feature exists to prevent.
 */
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

    // The audit row records the erasure WITHOUT re-recording the erased data.
    // Writing the old name into before_state would defeat the whole exercise:
    // audit_logs is append-only, so it would be the one copy nobody could
    // remove. What is preserved is that it happened, to which id, by whom.
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
          // Deliberately absent: the previous name, email and phone.
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
    // A refusal a person cannot be given a reason for is not a decision they
    // can appeal, and erasure requests are appealable by law.
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

/**
 * Repair path for the one inconsistent state the schema permits: a request
 * approved by the OLD center flow (which soft-deleted without scrubbing) and
 * therefore still carrying a name. The queue surfaces those; this erases them.
 */
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
