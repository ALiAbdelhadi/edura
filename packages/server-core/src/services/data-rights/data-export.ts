import { Prisma } from "@repo/database";
import { platformDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import type { TenantTx } from "../../db/scope";

// ===========================================================================
// SELF-SERVE DATA EXPORT — قانون 151/2020 (Personal Data Protection Law),
// article 2: the data subject's right to know, and to obtain a copy of, the
// personal data held about them.
//
// FIVE DECISIONS:
//
// 1. THE COPY NEVER LEAVES THE DATABASE. The built export is stored inline in
//    `data_export_requests.payload` and served through an authenticated route.
//    The alternative — a file in object storage behind a signed URL — creates
//    a complete dossier of a person sitting at a guessable address, and the
//    expiry becomes a bucket lifecycle rule somebody forgets to configure. The
//    expiry here is a column the reader checks on every download.
//
// 2. IT IS ASYNCHRONOUS BECAUSE IT MUST BE HONEST, NOT BECAUSE IT IS SLOW. For
//    most students the query set finishes in under a second. Building inline
//    would still be wrong: a center owner with ten thousand attendance rows
//    would hit the request timeout, and an export that works for small
//    accounts and fails for large ones is worse than one that always queues.
//
// 3. ONE IN FLIGHT PER SUBJECT, ENFORCED BY THE DATABASE. The partial unique
//    index `data_export_requests_one_in_flight` is the guard; the check below
//    is only there to turn the constraint violation into a sentence a person
//    can read. The cheapest way to make a worker miserable is a button pressed
//    forty times.
//
// 4. A GUARDIAN MAY EXPORT THEIR MINOR CHILD'S DATA — through exactly the same
//    approved-link gate every other parent capability uses. `requested_by`
//    records who asked, so an export a child did not initiate is visible as
//    such forever.
//
// 5. IT CARRIES NO SECRETS. No password hash, no session token, no 2FA seed,
//    no backup code. Those are credentials, not personal data, and shipping
//    them in a downloadable file would convert a privacy feature into an
//    account-takeover primitive. Stated as a rule here, and enforced by the
//    explicit `select` on every query below — there is no `include: true`
//    anywhere in this module.
// ===========================================================================

/** How long a built export stays downloadable. */
const EXPIRY_DAYS = 7;
/** Cap on rows per collection, so one enormous account cannot exhaust memory. */
const ROW_CAP = 5000;

export type ExportStatus = "pending" | "processing" | "ready" | "failed" | "expired";

export type ExportSummary = {
  id: string;
  userId: string;
  requestedBy: string;
  status: ExportStatus;
  requestedAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
  byteSize: number | null;
  error: string | null;
};

/**
 * "May `actor` act on `subjectUserId`'s data rights?" — ONE implementation,
 * shared by the export and the deletion flow, so the two can never disagree
 * about who a guardian is.
 *
 * Yourself: always. Your APPROVED minor child: yes. Anything else: no.
 * `pending`, `rejected` and `revoked` links all fail — approval is the point
 * of the link, and a revoked one stops working immediately.
 */
export async function assertDataRightsSubject(
  tx: TenantTx,
  actor: SessionUser,
  subjectUserId: string,
): Promise<{ self: boolean }> {
  if (actor.id === subjectUserId) return { self: true };

  if (actor.role !== "parent") {
    throw new ForbiddenError("You may only act on your own data");
  }

  const link = await tx.parentStudentLink.findFirst({
    where: { parentId: actor.id, studentId: subjectUserId, status: "approved" },
    select: { id: true },
  });
  if (!link) throw new ForbiddenError("Not linked to this student");

  return { self: false };
}

/** The subject's export history, newest first. Payloads are NOT included. */
export function listDataExports(actor: SessionUser, subjectUserId?: string) {
  const subject = subjectUserId ?? actor.id;

  return platformDb(async (tx) => {
    await assertDataRightsSubject(tx, actor, subject);

    const rows = await tx.dataExportRequest.findMany({
      where: { userId: subject },
      orderBy: { requestedAt: "desc" },
      take: 10,
      select: {
        id: true,
        userId: true,
        requestedBy: true,
        status: true,
        requestedAt: true,
        completedAt: true,
        expiresAt: true,
        byteSize: true,
        error: true,
      },
    });

    // An expiry that has passed reads as expired even if the sweeper has not
    // run yet. The screen must never offer a download the route will refuse.
    const now = new Date();
    return rows.map((r) => ({
      ...r,
      status:
        r.status === "ready" && r.expiresAt && r.expiresAt <= now
          ? ("expired" as ExportStatus)
          : (r.status as ExportStatus),
    })) satisfies ExportSummary[];
  });
}

export function requestDataExport(actor: SessionUser, subjectUserId?: string) {
  const subject = subjectUserId ?? actor.id;

  return platformDb(async (tx) => {
    await assertDataRightsSubject(tx, actor, subject);

    const inFlight = await tx.dataExportRequest.findFirst({
      where: { userId: subject, status: { in: ["pending", "processing"] } },
      select: { id: true },
    });
    if (inFlight) {
      throw new BusinessRuleError("An export is already being prepared for this account");
    }

    const created = await tx.dataExportRequest.create({
      data: { userId: subject, requestedBy: actor.id, status: "pending" },
      select: { id: true, status: true, requestedAt: true },
    });

    // Audited: an export is a complete copy of a person's record leaving the
    // system, so who asked for it is not an implementation detail.
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "data_export.requested",
        targetType: "user",
        targetId: subject,
        afterState: { exportId: created.id, self: actor.id === subject } as never,
        onBehalfOf: null,
      },
    });

    return created;
  });
}

/** Withdraw a queued export. Only while it is still queued. */
export function cancelDataExport(actor: SessionUser, exportId: string) {
  return platformDb(async (tx) => {
    const row = await tx.dataExportRequest.findUnique({
      where: { id: exportId },
      select: { id: true, userId: true, status: true },
    });
    if (!row) throw new NotFoundError("Export request not found");
    await assertDataRightsSubject(tx, actor, row.userId);

    if (row.status !== "pending") {
      throw new BusinessRuleError("Only a queued export can be withdrawn");
    }

    // Deleting rather than status-flagging: a withdrawn export produced no
    // data and left no artifact, so there is nothing for the row to be
    // evidence OF. The audit row above already records that it was asked for.
    await tx.dataExportRequest.delete({ where: { id: exportId } });
    return { cancelled: true };
  });
}

/**
 * Read a built export for download. Refuses anything not `ready`, and refuses
 * an expired one even if the sweeper has not yet rewritten its status — the
 * clock, not the column, is the authority.
 */
export function getDataExportPayload(actor: SessionUser, exportId: string) {
  return platformDb(async (tx) => {
    const row = await tx.dataExportRequest.findUnique({ where: { id: exportId } });
    if (!row) throw new NotFoundError("Export request not found");
    await assertDataRightsSubject(tx, actor, row.userId);

    if (row.status !== "ready" || !row.payload) {
      throw new BusinessRuleError("This export is not ready");
    }
    if (row.expiresAt && row.expiresAt <= new Date()) {
      throw new BusinessRuleError("This export has expired. Request a new one.");
    }

    return { payload: row.payload, completedAt: row.completedAt, userId: row.userId };
  });
}

// ---------------------------------------------------------------------------
// THE BUILDER — runs in the worker, never in a user request.
// ---------------------------------------------------------------------------

/**
 * Everything the platform holds about one person, in the shape it is held.
 *
 * Note what each block selects EXPLICITLY. There is no `include: true` and no
 * spread of a whole row anywhere below, which is what keeps `password_hash`,
 * `token_version`, session tokens and 2FA secrets out by construction rather
 * than by remembering to omit them.
 */
async function buildExportPayload(tx: TenantTx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      locale: true,
      theme: true,
      status: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) throw new NotFoundError("User not found");

  const [studentProfile, parentProfile, teacherProfile] = await Promise.all([
    tx.studentProfile.findUnique({
      where: { userId },
      select: {
        fullName: true,
        phone: true,
        studentCode: true,
        familyLinkCode: true,
        dateOfBirth: true,
        guardianEmail: true,
        guardianPhone: true,
        pointsBalance: true,
        walletBalance: true,
        createdAt: true,
      },
    }),
    tx.parentProfile.findUnique({
      where: { userId },
      select: { walletBalance: true, createdAt: true },
    }),
    tx.teacherProfile.findUnique({
      where: { userId },
      select: { bio: true, walletBalance: true, createdAt: true },
    }),
  ]);

  // Money and academic records are keyed on the USER id for a student, so a
  // non-student simply gets empty collections here rather than a special case.
  const [payments, enrollments, subscriptions, attendance, grades, notifications, parentLinks] =
    await Promise.all([
      tx.payment.findMany({
        where: { OR: [{ studentId: userId }, { payerUserId: userId }] },
        orderBy: { paidAt: "desc" },
        take: ROW_CAP,
        select: {
          receiptNumber: true,
          amount: true,
          currency: true,
          status: true,
          note: true,
          paidAt: true,
        },
      }),
      tx.enrollment.findMany({
        where: { studentId: userId },
        take: ROW_CAP,
        select: { courseId: true, status: true, createdAt: true },
      }),
      tx.subscription.findMany({
        where: { studentId: userId },
        take: ROW_CAP,
        select: {
          plan: true,
          status: true,
          price: true,
          currency: true,
          periodStart: true,
          periodEnd: true,
          activatedAt: true,
          cancelledAt: true,
          createdAt: true,
        },
      }),
      tx.attendanceRecord.findMany({
        where: { studentId: userId },
        orderBy: { createdAt: "desc" },
        take: ROW_CAP,
        select: { sessionId: true, status: true, createdAt: true },
      }),
      tx.gradeScore.findMany({
        where: { studentId: userId },
        take: ROW_CAP,
        // `grade_scores` carries no timestamps of its own — the date belongs to
        // the Grade it scores, which the gradeId points at.
        select: { gradeId: true, score: true },
      }),
      tx.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: ROW_CAP,
        select: { type: true, title: true, body: true, status: true, createdAt: true },
      }),
      tx.parentStudentLink.findMany({
        where: { OR: [{ parentId: userId }, { studentId: userId }] },
        select: { parentId: true, studentId: true, status: true, createdAt: true },
      }),
    ]);

  return {
    // A self-describing header, so the file is readable by the person who
    // downloads it rather than only by us.
    _meta: {
      generatedAt: new Date().toISOString(),
      subjectUserId: userId,
      lawReference: "Egypt — Personal Data Protection Law 151/2020",
      excluded: [
        "password hash",
        "session tokens",
        "two-factor secrets and backup codes",
      ],
      rowCapPerCollection: ROW_CAP,
    },
    account: user,
    profiles: { student: studentProfile, parent: parentProfile, teacher: teacherProfile },
    payments,
    enrollments,
    subscriptions,
    attendance,
    grades,
    notifications,
    parentLinks,
  };
}

/**
 * The worker step. Claims ONE queued export atomically, builds it, stores it.
 *
 * The claim is an `updateMany` guarded on `status = 'pending'`, so two workers
 * racing on the same row produce one winner and one no-op — the same
 * claim-by-conditional-update the payment webhook uses. A `findFirst` followed
 * by an `update` would let both build the same export.
 */
export async function processNextDataExport(): Promise<{ processed: string | null }> {
  const claimed = await platformDb(async (tx) => {
    const candidate = await tx.dataExportRequest.findFirst({
      where: { status: "pending" },
      orderBy: { requestedAt: "asc" },
      select: { id: true, userId: true },
    });
    if (!candidate) return null;

    const { count } = await tx.dataExportRequest.updateMany({
      where: { id: candidate.id, status: "pending" },
      data: { status: "processing", startedAt: new Date() },
    });
    return count === 1 ? candidate : null;
  });

  if (!claimed) return { processed: null };

  try {
    const payload = await platformDb((tx) => buildExportPayload(tx, claimed.userId));
    const serialized = JSON.stringify(payload);

    await platformDb((tx) =>
      tx.dataExportRequest.update({
        where: { id: claimed.id },
        data: {
          status: "ready",
          payload: payload as never,
          byteSize: Buffer.byteLength(serialized, "utf8"),
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + EXPIRY_DAYS * 86_400_000),
          error: null,
        },
      }),
    );
  } catch (err) {
    // A failure is recorded on the row, not swallowed: the subject asked for
    // something and is entitled to know it did not happen.
    await platformDb((tx) =>
      tx.dataExportRequest.update({
        where: { id: claimed.id },
        data: {
          status: "failed",
          error: err instanceof Error ? err.message.slice(0, 500) : "Unknown error",
          completedAt: new Date(),
        },
      }),
    );
  }

  return { processed: claimed.id };
}

/**
 * Drop the payloads of exports past their expiry.
 *
 * The ROW survives with `status = 'expired'` — the fact that a copy was made
 * and handed over is itself part of the record — but the copy is gone.
 */
export async function expireDataExports(): Promise<{ expired: number }> {
  const { count } = await platformDb((tx) =>
    tx.dataExportRequest.updateMany({
      where: { status: "ready", expiresAt: { lte: new Date() } },
      // Prisma.DbNull, not `null` and not `undefined`: on a Json column `null`
      // means the JSON value null and `undefined` means "leave it alone", so
      // either would leave the copy sitting in the database while the row
      // claimed to be expired.
      data: { status: "expired", payload: Prisma.DbNull, byteSize: null },
    }),
  );
  return { expired: count };
}

/** Cron entry point: drain the queue, then sweep expiries. */
export async function runDataExportJob(batch = 5) {
  let processed = 0;
  for (let i = 0; i < batch; i++) {
    const { processed: id } = await processNextDataExport();
    if (!id) break;
    processed++;
  }
  const { expired } = await expireDataExports();
  return { processed, expired };
}
