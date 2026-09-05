import type { Role } from "@repo/database";
import { exactQuery } from "@repo/database/search-text";
import { WWW_LOGIN_ROLES } from "@repo/server-core/auth/login-policy";
import { mintViewAsToken } from "@repo/server-core/auth/view-as-token";
import { trustedClientIp } from "@repo/server-core/rate-limit/token-bucket";
import { requestPasswordReset } from "@repo/server-core/services/auth/password-reset";
import { headers } from "next/headers";
import type { SessionUser } from "@/lib/auth/session";
import { platformDb, type TenantTx } from "@/lib/db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import { parsePageLimit } from "@/lib/validation/common";
import { writeAdminAudit } from "@/lib/services/admin/admin-audit";

async function callerIp(): Promise<string | null> {
  try {
    const h = await headers();
    const ip = trustedClientIp((name) => h.get(name));
    return ip === "unknown" ? null : ip;
  } catch {
    return null;
  }
}

// Every row here is about a user and carries the caller's IP — the one thing
// the shared writer cannot read for itself.
async function audit(
  tx: TenantTx,
  actor: Pick<SessionUser, "id">,
  action: string,
  targetId: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
) {
  await writeAdminAudit(tx, actor, {
    action,
    targetType: "user",
    targetId,
    before,
    after,
    ipAddress: await callerIp(),
  });
}

function requireReason(reason: string | undefined, what: string): string {
  const why = reason?.trim();
  if (!why) throw new BusinessRuleError(`A reason is required to ${what}`);
  return why;
}

function refuseSelf(actor: SessionUser, userId: string, what: string): void {
  if (actor.id === userId) {
    throw new BusinessRuleError(`You cannot ${what} your own account`);
  }
}

export type UserListFilters = {
  q?: string;
  role?: Role;
  status?: string;
  take?: number;
  cursor?: string;
};

export function listUsers(filters: UserListFilters) {
  const { limit: take } = parsePageLimit({ limit: filters.take }, 25);
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = {};
    if (filters.role) where.role = filters.role;
    if (filters.status) where.status = filters.status;
    const q = filters.q?.trim();
    if (q) {
      where.AND = exactQuery(q, (t) => ({ searchText: { contains: t } }));
    }

    const rows = await tx.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        locale: true,
        twoFactorEnabled: true,
        isDemo: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      users: page,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  });
}

export function getUserDetail(userId: string) {
  return platformDb(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        locale: true,
        emailVerified: true,
        twoFactorEnabled: true,
        tokenVersion: true,
        isDemo: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
    if (!user) throw new NotFoundError("User not found");

    const sessions = await tx.authSession.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
        impersonatedBy: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const centerId =
      user.role === "center_admin"
        ? (await tx.centerAdminProfile.findUnique({
            where: { userId },
            select: { centerId: true },
          }))?.centerId ?? null
        : user.role === "center_staff"
          ? (await tx.centerStaff.findFirst({
              where: { staffUserId: userId, removedAt: null },
              select: { centerId: true },
            }))?.centerId ?? null
          : null;

    const center = centerId
      ? await tx.center.findUnique({
          where: { id: centerId },
          select: { id: true, name: true, status: true },
        })
      : null;

    return { user, sessions, center };
  });
}

export function setUserSuspended(
  actor: SessionUser,
  userId: string,
  suspended: boolean,
  reason?: string,
) {
  refuseSelf(actor, userId, suspended ? "suspend" : "reinstate");
  const why = requireReason(reason, suspended ? "suspend an account" : "reinstate an account");

  return platformDb(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true, role: true },
      });
      if (!user) throw new NotFoundError("User not found");
      if (user.status === "blacklisted") {
        throw new BusinessRuleError("Lift the blacklist first");
      }

      const next = suspended ? "suspended" : "active";
      if (user.status === next) {
        throw new BusinessRuleError(`Account is already ${next}`);
      }

      const row = await tx.user.update({
        where: { id: userId },
        data: { status: next },
        select: { id: true, status: true, tokenVersion: true },
      });

      await audit(tx, actor,
        suspended ? "user.suspended" : "user.reinstated",
        userId,
        { status: user.status },
        { status: row.status, reason: why },
      );

      return { id: row.id, status: row.status };
    },
    { actorId: actor.id },
  );
}

export function revokeAllSessions(actor: SessionUser, userId: string, reason?: string) {
  const why = requireReason(reason, "revoke sessions");

  return platformDb(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, tokenVersion: true },
      });
      if (!user) throw new NotFoundError("User not found");

      const removed = await tx.authSession.deleteMany({ where: { userId } });
      const bumped = await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
        select: { tokenVersion: true },
      });

      await audit(tx, actor,
        "user.sessions_revoked",
        userId,
        { tokenVersion: user.tokenVersion },
        {
          tokenVersion: bumped.tokenVersion,
          sessionsRemoved: removed.count,
          reason: why,
          statusChanged: false,
          canSignInAgain: true,
        },
      );

      return { userId, sessionsRemoved: removed.count, tokenVersion: bumped.tokenVersion };
    },
    { actorId: actor.id },
  );
}

export function revokeOneSession(actor: SessionUser, userId: string, sessionId: string) {
  return platformDb(
    async (tx) => {
      const session = await tx.authSession.findUnique({
        where: { id: sessionId },
        select: { id: true, userId: true, ipAddress: true, userAgent: true },
      });
      if (!session || session.userId !== userId) {
        throw new NotFoundError("Session not found");
      }
      await tx.authSession.delete({ where: { id: sessionId } });
      await audit(tx, actor, "user.session_revoked", userId, undefined, {
        sessionId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      });
      return { userId, sessionId };
    },
    { actorId: actor.id },
  );
}

export function resetTwoFactor(actor: SessionUser, userId: string, reason?: string) {
  const why = requireReason(reason, "reset two-factor authentication");

  return platformDb(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, twoFactorEnabled: true, role: true },
      });
      if (!user) throw new NotFoundError("User not found");
      if (!user.twoFactorEnabled) {
        throw new BusinessRuleError("This account does not have 2FA enabled");
      }

      await tx.twoFactor.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false },
      });
      const removed = await tx.authSession.deleteMany({ where: { userId } });

      await audit(tx, actor,
        "user.two_factor_reset",
        userId,
        { twoFactorEnabled: true },
        {
          twoFactorEnabled: false,
          reason: why,
          sessionsRemoved: removed.count,
          mustReEnroll: user.role === "super_admin" || user.role === "accountant",
        },
      );

      return { userId, twoFactorEnabled: false, sessionsRemoved: removed.count };
    },
    { actorId: actor.id },
  );
}

export async function sendPasswordReset(actor: SessionUser, userId: string, reason?: string) {
  const why = requireReason(reason, "send a password reset");
  const target = await platformDb(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, locale: true },
    });
    if (!user) throw new NotFoundError("User not found");
    if (!user.email) {
      throw new BusinessRuleError("This account has no email address to send a reset to");
    }
    if (user.status !== "active") {
      throw new BusinessRuleError("Only an active account can be sent a reset link");
    }
    return user;
  });

  await requestPasswordReset(target.email as string, target.locale);

  await platformDb(
    (tx) =>
      audit(tx, actor, "user.password_reset_sent", userId, undefined, {
        email: target.email,
        reason: why,
      }),
    { actorId: actor.id },
  );

  return { userId, email: target.email };
}

const IMPERSONATABLE: ReadonlySet<Role> = new Set<Role>(["accountant"]);

export function assertImpersonatable(actor: SessionUser, userId: string) {
  if (actor.role !== "super_admin") {
    throw new ForbiddenError("Only a super admin can impersonate");
  }
  refuseSelf(actor, userId, "impersonate");

  return platformDb(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    if (!user) throw new NotFoundError("User not found");
    if (user.status !== "active") {
      throw new BusinessRuleError("Only an active account can be impersonated");
    }
    if (!IMPERSONATABLE.has(user.role)) {
      throw new BusinessRuleError(
        user.role === "super_admin"
          ? "A super admin cannot impersonate another super admin"
          : "Only back-office accounts can be impersonated — a session minted here is not valid in the main app",
      );
    }
    return user;
  });
}


export function assertViewAsTarget(actor: SessionUser, userId: string) {
  if (actor.role !== "super_admin") {
    throw new ForbiddenError("Only a super admin can view the app as another user");
  }
  refuseSelf(actor, userId, "view the app as");

  return platformDb(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    if (!user) throw new NotFoundError("User not found");
    if (user.status !== "active") {
      throw new BusinessRuleError("Only an active account can be viewed as");
    }
    if (!WWW_LOGIN_ROLES.has(user.role)) {
      throw new BusinessRuleError(
        "Only an ERP account can be viewed as — a back-office account is impersonated in this app instead",
      );
    }
    return user;
  });
}

export async function startViewAs(
  actor: SessionUser,
  target: { id: string; role: Role; email: string | null },
) {
  const minted = mintViewAsToken({
    targetUserId: target.id,
    actorUserId: actor.id,
    targetRole: target.role,
  });

  await platformDb(
    (tx) =>
      audit(tx, actor, "user.view_as_requested", target.id, undefined, {
        jti: minted.jti,
        targetRole: target.role,
        targetEmail: target.email,
      }),
    { actorId: actor.id },
  );

  return minted;
}

export function auditImpersonationStart(
  actor: SessionUser,
  target: { id: string; role: Role; email: string | null },
) {
  return platformDb(
    (tx) =>
      audit(tx, actor, "user.impersonation_started", target.id, undefined, {
        targetRole: target.role,
        targetEmail: target.email,
      }),
    { actorId: actor.id },
  );
}

export function auditImpersonationStop(actorId: string, targetUserId: string) {
  return platformDb(
    (tx) =>
      audit(tx, { id: actorId }, "user.impersonation_stopped", targetUserId, undefined, {
        endedBy: actorId,
      }),
    { actorId },
  );
}
