import { Prisma } from "@repo/database";
import { platformDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import type { TenantTx } from "../../db/scope";

const EXPIRY_DAYS = 7;
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

    await tx.dataExportRequest.delete({ where: { id: exportId } });
    return { cancelled: true };
  });
}

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

export async function expireDataExports(): Promise<{ expired: number }> {
  const { count } = await platformDb((tx) =>
    tx.dataExportRequest.updateMany({
      where: { status: "ready", expiresAt: { lte: new Date() } },
      data: { status: "expired", payload: Prisma.DbNull, byteSize: null },
    }),
  );
  return { expired: count };
}

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
