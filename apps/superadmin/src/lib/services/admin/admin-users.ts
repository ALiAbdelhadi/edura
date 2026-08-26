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

// ===========================================================================
// PLATFORM USER DIRECTORY — the cross-role user surface roadmap decision #10
// called for and that was never built (centers, teachers, students and
// registrations each had a screen; "users" did not).
//
// THREE BOUNDARIES, each load-bearing:
//
// 1. ONE SUSPENSION MECHANISM. better-auth's admin plugin ships `banned` /
//    `ban_reason` / `ban_expires` columns plus its own ban endpoints. This app
//    does NOT use them. The platform already disables an account through
//    `users.status` (+ the 3-level blacklist), and C-03 wires that column to
//    hard session revocation. A second, parallel way to disable an account is
//    precisely the C-04 failure mode (two allowlists that drifted). So the
//    suspend/reinstate action below writes `status` through the existing
//    audited path and the better-auth columns stay inert. If you are looking
//    for `auth.api.banUser`, its absence is the design.
//
// 2. IMPERSONATION IS BOUNDED TO THE BACK OFFICE. apps/superadmin and apps/www
//    carry distinct cookie names AND distinct signing secrets, so a session
//    minted here is unreadable by www by construction. "Impersonate a teacher
//    to see their portal" is therefore not something this app can do without
//    breaching that separation — and it will not. What it can do safely is let
//    a super_admin view the finance portal as the accountant sees it: same app,
//    same cookie, audited on start AND stop, with a persistent banner. Other
//    super_admins are refused too (lateral privilege), which is why the admin
//    plugin's `impersonate-admins` statement is deliberately not granted.
//    SEE ALSO the "VIEW AS" block further down: reaching an ERP role is done
//    by a signed handoff token that makes the OTHER app mint its own session,
//    NOT by stretching this cookie across the boundary. This paragraph is still
//    true — it is the reason that mechanism looks the way it does.
//
// 3. MONEY STAYS READ-ONLY *IN THIS APP*. Nothing here touches a ledger,
//    wallet or payout, and this module imports no money service — checkable by
//    reading the imports. The qualifier is new and load-bearing: since
//    2026-08-20 a super admin CAN move money through a view-as session, but
//    only by being the ERP user in the ERP app, under that user's own session
//    and that app's own audit. No money capability was added here.
// ===========================================================================

const PAGE_MAX = 100;

/**
 * WHERE the action came from. Resolved here rather than threaded through six
 * service signatures and their routes — and it must never throw: the DB suites
 * call these services directly, outside any request scope, and an audit row
 * that fails to write is far worse than one missing its IP.
 */
async function callerIp(): Promise<string | null> {
  try {
    const h = await headers();
    const ip = trustedClientIp((name) => h.get(name));
    return ip === "unknown" ? null : ip;
  } catch {
    return null;
  }
}

/** Every write here records who did it, to whom, from where, and why. */
async function audit(
  tx: TenantTx,
  actorId: string,
  action: string,
  targetId: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      targetType: "user",
      targetId,
      beforeState: (before ?? undefined) as never,
      afterState: (after ?? undefined) as never,
      ipAddress: await callerIp(),
      // `on_behalf_of` means "assistant X acting for teacher Y" (Step 8).
      // A super admin acts as themselves.
      onBehalfOf: null,
    },
  });
}

function requireReason(reason: string | undefined, what: string): string {
  const why = reason?.trim();
  if (!why) throw new BusinessRuleError(`A reason is required to ${what}`);
  return why;
}

/** Refuse an action aimed at the actor's own account. */
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

/**
 * Cross-role directory. Search matches name / email / phone; the role and
 * status filters are exact. Soft-deleted users are excluded by the client
 * extension, same as every other list in the app.
 *
 * THE SEARCH IS EXACT, AND INDEXED. `contains` with `mode: "insensitive"` is
 * ILIKE, which folds ASCII case and nothing else, so «احمد» matched none of the
 * rows stored «أحمد» and this directory answered "no such person" about people
 * it holds. It filters `users.search_text` now — a stored generated column
 * (migration 20260820160000) holding the row's name, email and phone already
 * normalized, plus the same text with its spaces closed up, which is exactly
 * what `matchesSearchTerms` compares. One `contains` per typed term, ANDed.
 *
 * Between the two there was a narrow-only stage that returned a SUPERSET,
 * because this list is CURSOR-paginated and a JS filter applied after the page
 * is cut returns a short page and a `nextCursor` that skips rows. The column is
 * what let the exact answer and the pagination coexist.
 */
export function listUsers(filters: UserListFilters) {
  const take = Math.min(PAGE_MAX, Math.max(1, filters.take ?? 25));
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
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  });
}

/**
 * One user, plus the operational context an admin needs before acting:
 * their live sessions (device / IP / last seen), 2FA state, and the center
 * they belong to when the role has one.
 */
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

/**
 * Disable / re-enable an account. Delegates to `users.status` — the platform's
 * ONE suspension mechanism (see boundary 1). Suspending bumps the session
 * epoch through sessionRevocationExtension, which since the better-auth
 * migration deletes the user's session rows in the same statement, so access
 * ends on the next request rather than at token expiry.
 */
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
        // The blacklist is a separate, heavier decision with its own reversal
        // journal (H-04). Quietly flipping status here would desync it.
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

      await audit(
        tx,
        actor.id,
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

/**
 * End every live session without changing the account's status — the
 * compromised-credential response, not a punishment. The person can sign
 * straight back in with the same password.
 */
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
      // Bump the epoch too: it is the durable record on the row, and it
      // invalidates anything minted outside this table.
      const bumped = await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
        select: { tokenVersion: true },
      });

      await audit(
        tx,
        actor.id,
        "user.sessions_revoked",
        userId,
        { tokenVersion: user.tokenVersion },
        {
          tokenVersion: bumped.tokenVersion,
          sessionsRemoved: removed.count,
          reason: why,
          // Said plainly: this is not a deactivation.
          statusChanged: false,
          canSignInAgain: true,
        },
      );

      return { userId, sessionsRemoved: removed.count, tokenVersion: bumped.tokenVersion };
    },
    { actorId: actor.id },
  );
}

/** End ONE device's session — the targeted version of the above. */
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
      await audit(tx, actor.id, "user.session_revoked", userId, undefined, {
        sessionId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      });
      return { userId, sessionId };
    },
    { actorId: actor.id },
  );
}

/**
 * Clear a user's TOTP enrollment — the recovery path for someone who lost
 * their authenticator. For a back-office account this does NOT lower the bar:
 * 2FA is required there, so the dashboard gate forces re-enrollment on the
 * next sign-in. Sessions are ended too, so the reset cannot be used to keep a
 * live session alive without a second factor.
 */
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

      await audit(
        tx,
        actor.id,
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

/**
 * Email the user a password-reset link. The admin never sees or sets the
 * password — same principle as the invite flow, where the creator no longer
 * types one. The link points at the www reset page, which is role-agnostic
 * (it consumes a token and asks nothing about who you are), so a back-office
 * account resets there and then signs in to the back office.
 */
export async function sendPasswordReset(actor: SessionUser, userId: string, reason?: string) {
  // Same rule as every other action on this screen: the trail records WHY.
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
      // requestPasswordReset silently no-ops for a non-active account; say so
      // instead of reporting a delivery that will never happen.
      throw new BusinessRuleError("Only an active account can be sent a reset link");
    }
    return user;
  });

  await requestPasswordReset(target.email as string, target.locale);

  await platformDb(
    (tx) =>
      audit(tx, actor.id, "user.password_reset_sent", userId, undefined, {
        email: target.email,
        reason: why,
      }),
    { actorId: actor.id },
  );

  return { userId, email: target.email };
}

// ---------------------------------------------------------------------------
// Impersonation (boundary 2)
// ---------------------------------------------------------------------------

/** Roles a super_admin may view the app as. Deliberately one entry. */
const IMPERSONATABLE: ReadonlySet<Role> = new Set<Role>(["accountant"]);

/**
 * Assert that impersonating this user is permitted, and return them.
 * Refuses, with a reason the UI can show:
 *   - anyone but a super_admin asking;
 *   - a www role (the session would be unreadable by www anyway — distinct
 *     cookie name and signing secret — so this is a boundary, not a limitation
 *     we could lift by trying harder);
 *   - another super_admin (lateral privilege);
 *   - yourself, or an account that is not active.
 */
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


// ===========================================================================
// "VIEW AS" — the cross-app door (added 2026-08-20, Ali's decision).
//
// Boundary 2 above still describes the IN-APP impersonation, and it still
// holds: a back-office session is unreadable by the ERP by construction, and
// nothing here changes that. What is new is a SECOND mechanism that does not
// try to: instead of stretching a back-office cookie across the boundary, the
// super admin gets a signed 60-second handoff token, and apps/erp mints its own
// ordinary session for the target user (`auth/view-as-plugin.ts`, where the six
// claim-time gates live).
//
// The split of duties is the safety property. THIS module decides WHO may be
// viewed and records the intent; the ERP re-decides everything for itself at
// claim time — it re-reads the actor, re-reads the target, and refuses a
// replayed token. Neither app takes the other's word for anything, so a bug or
// a stale token on this side cannot become an entry on that side.
//
// A DEPARTURE FROM BOUNDARY 3, RECORDED HONESTLY: a view-as session is
// write-capable INCLUDING money. Ali decided that on 2026-08-20 after the
// alternative (block money routes during view-as) was put to him. This module
// still imports no money service — the capability comes from the target's own
// session in the other app, not from anything here — but it would be dishonest
// to leave "money stays read-only in the back office" standing unqualified when
// this button exists. CLAUDE.md carries the amended invariant.
// ===========================================================================

/**
 * May `actor` view the app as `userId`?
 *
 * Refuses: a non-super_admin caller, the actor's own account, an account that
 * is not `active`, and any role the ERP does not host — a back-office target
 * belongs to `assertImpersonatable` above, which stays in-app.
 */
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

/**
 * Mint the handoff token AND record the intent, in that order but as one step,
 * so a token can never exist without an audit row naming who asked for it.
 *
 * The row is written while the actor is still unambiguously themselves; the ERP
 * writes its own `user.view_as_claimed` row when the token is actually spent,
 * which is what distinguishes "a super admin pressed the button" from "a
 * session was opened".
 */
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
      audit(tx, actor.id, "user.view_as_requested", target.id, undefined, {
        jti: minted.jti,
        targetRole: target.role,
        targetEmail: target.email,
      }),
    { actorId: actor.id },
  );

  return minted;
}

/** Record the start of an impersonation. Called after the session is minted. */
export function auditImpersonationStart(
  actor: SessionUser,
  target: { id: string; role: Role; email: string | null },
) {
  return platformDb(
    (tx) =>
      audit(tx, actor.id, "user.impersonation_started", target.id, undefined, {
        targetRole: target.role,
        targetEmail: target.email,
      }),
    { actorId: actor.id },
  );
}

/** Record the end of an impersonation. */
export function auditImpersonationStop(actorId: string, targetUserId: string) {
  return platformDb(
    (tx) =>
      audit(tx, actorId, "user.impersonation_stopped", targetUserId, undefined, {
        endedBy: actorId,
      }),
    { actorId },
  );
}
