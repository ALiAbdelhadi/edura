import { prisma, withPlatformContext } from "@repo/database";
import { WWW_LOGIN_ROLES } from "@repo/server-core/auth/login-policy";
import {
  VIEW_AS_SESSION_TTL_SECONDS,
  verifyViewAsToken,
} from "@repo/server-core/auth/view-as-token";
import { checkRateLimit, trustedClientIp } from "@/lib/rate-limit/token-bucket";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

/** The audit action written on a successful claim. Also the replay key. */
export const VIEW_AS_CLAIMED = "user.view_as_claimed";

/** The audit action written when a view-as session is ended from the ERP. */
export const VIEW_AS_ENDED = "user.view_as_ended";

/**
 * "VIEW AS" — the ERP end of the back-office handoff.
 *
 * A `super_admin` in apps/superadmin asks for a signed token (see
 * `@repo/server-core/auth/view-as-token`, which carries the token design) and
 * the browser POSTs it here. This endpoint mints a REAL ERP session for the
 * target user, so from that moment on every screen, route, service and money
 * path behaves exactly as it does for that user — because it IS that user's
 * session. There is no parallel implementation to keep in sync, which is the
 * entire point: a mirrored back-office copy of 218 routes would drift, and the
 * drift would be discovered in production.
 *
 * WHAT THIS DELIBERATELY DOES **NOT** WEAKEN
 *
 *  * `login-policy.ts` is untouched. `canSignIn("www", "super_admin")` still
 *    answers false, so the password door on this app keeps refusing back-office
 *    accounts. This is a second door with its own key, not a hole in the first.
 *  * The cookie/secret separation between the two apps is untouched. Nothing
 *    here reads a back-office cookie; the only thing that crosses is a signed,
 *    60-second payload.
 *  * `impersonatedBy` is stamped on the session row, so the fact that a super
 *    admin is behind it is a DATABASE fact, not a UI convention — the banner,
 *    the audit trail and any later forensics all read the same column.
 *
 * SIX GATES, all of them re-checked HERE rather than trusted from the token:
 *
 *  1. rate limit per IP — the token is 256-bit-equivalent, this is for noise;
 *  2. signature + 60-second expiry (`verifyViewAsToken`);
 *  3. the jti has not been claimed before (best-effort single use — the honest
 *     limitation is documented on the token module);
 *  4. THE ACTOR IS STILL A LIVE `super_admin`. Re-read at claim time, not taken
 *     from the token: a super admin demoted or suspended in the sixty seconds
 *     between mint and claim must not get in;
 *  5. the target is an ERP role (`WWW_LOGIN_ROLES`), `active`, not soft-deleted.
 *     A back-office target is refused — that case already has its own in-app
 *     impersonation and does not need a cross-app session;
 *  6. the minted session is capped at ONE HOUR regardless of the app's 30-day
 *     default, and is stamped with the actor. The cap lives in `session.ts`
 *     (`isViewAsExpired`, measured from `created_at`) — NOT in `expires_at`,
 *     which better-auth's rolling refresh extends out from under it.
 *
 * ONE MONEY NOTE, STATED PLAINLY. Ali decided on 2026-08-20 that a view-as
 * session is write-capable INCLUDING money — cash payments, wallet writes,
 * refunds, payouts. Nothing here blocks a money route, on purpose. What makes
 * that defensible is that every such write already carries its own audit and
 * ledger row, and this session's `impersonated_by` column names the human
 * behind it. See CLAUDE.md, "MONEY IS READ-ONLY IN THE BACK OFFICE" — which was
 * amended for exactly this and is no longer unqualified.
 */
export const viewAsPlugin = () => {
  return {
    id: "view-as",
    endpoints: {
      claimViewAs: createAuthEndpoint(
        "/view-as/claim",
        {
          method: "POST",
          body: z.object({ token: z.string() }),
        },
        async (ctx) => {
          const ip = trustedClientIp((n) => ctx.headers?.get(n));
          if (!(await checkRateLimit(`view-as:${ip}`, 10, 10))) {
            throw new APIError("TOO_MANY_REQUESTS", { message: "RATE_LIMITED" });
          }

          // (2) nothing below this line trusts the payload until it verified.
          const payload = verifyViewAsToken(ctx.body.token.trim());
          if (!payload) {
            throw new APIError("UNAUTHORIZED", { message: "INVALID_TOKEN" });
          }

          const claimed = await withPlatformContext(async (tx) => {
            // (3) best-effort single use.
            const replay = await tx.auditLog.findFirst({
              where: {
                action: VIEW_AS_CLAIMED,
                afterState: { path: ["jti"], equals: payload.jti },
              },
              select: { id: true },
            });
            if (replay) return null;

            // (4) the actor, re-read live.
            const actor = await tx.user.findUnique({
              where: { id: payload.act },
              select: { id: true, role: true, status: true, email: true },
            });
            if (!actor || actor.role !== "super_admin" || actor.status !== "active") {
              return null;
            }

            // (5) the target, re-read live.
            const target = await tx.user.findUnique({
              where: { id: payload.sub },
              select: {
                id: true,
                role: true,
                status: true,
                deletedAt: true,
                locale: true,
              },
            });
            if (!target) return null;
            if (target.deletedAt) return null;
            if (target.status !== "active") return null;
            if (!WWW_LOGIN_ROLES.has(target.role)) return null;

            await tx.auditLog.create({
              data: {
                actorId: actor.id,
                action: VIEW_AS_CLAIMED,
                targetType: "user",
                targetId: target.id,
                afterState: {
                  jti: payload.jti,
                  targetRole: target.role,
                  actorEmail: actor.email,
                  app: "erp",
                } as never,
                ipAddress: ip === "unknown" ? null : ip,
                onBehalfOf: null,
              },
            });

            return {
              userId: target.id,
              role: target.role,
              locale: target.locale ?? "ar",
              actorId: actor.id,
            };
          });

          if (!claimed) {
            // ONE opaque refusal for every failure above, so a probe cannot
            // learn which gate stopped it.
            throw new APIError("UNAUTHORIZED", { message: "INVALID_TOKEN" });
          }

          const session = await ctx.context.internalAdapter.createSession(
            claimed.userId,
          );
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "SESSION_CREATE_FAILED",
            });
          }

          // (6) Stamped and shortened AFTER creation rather than passed in:
          // `createSession` runs the `databaseHooks.session.create.before` hook
          // that resolves `centerId`, and going around it would hand a centre
          // admin a session with no centre — the exact class of bug C-04 was
          // about. So the hook runs untouched and these two columns are set on
          // the row it produced.
          //
          // `expiresAt` here is HONEST BUT NOT ENFORCING. better-auth refreshes
          // that column on read (30-day `expiresIn`, 1-day `updateAge`), so a
          // one-hour value is pushed back to thirty days by the very first
          // request — measured in the proof suite, which read 2592000 seconds
          // where it expected 3600. The window is enforced in `session.ts` via
          // `isViewAsExpired`, against `created_at`, which nothing refreshes.
          // The stamp stays because it is the correct value at creation and
          // because anything reading the row directly should see an hour.
          const expiresAt = new Date(Date.now() + VIEW_AS_SESSION_TTL_SECONDS * 1000);
          await prisma.authSession.update({
            where: { id: session.id },
            data: { impersonatedBy: claimed.actorId, expiresAt },
          });

          const user = await ctx.context.internalAdapter.findUserById(claimed.userId);
          if (!user) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "SESSION_CREATE_FAILED",
            });
          }
          await setSessionCookie(ctx, { session: { ...session, expiresAt }, user });

          return ctx.json({
            user: { id: claimed.userId, role: claimed.role, locale: claimed.locale },
            viewAs: { actorId: claimed.actorId, expiresAt: expiresAt.toISOString() },
          });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
};
