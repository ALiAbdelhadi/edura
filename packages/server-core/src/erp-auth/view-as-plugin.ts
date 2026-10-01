import { prisma, withPlatformContext } from "@repo/database";
import { WWW_LOGIN_ROLES } from "../auth/login-policy";
import {
  VIEW_AS_SESSION_TTL_SECONDS,
  verifyViewAsToken,
} from "../auth/view-as-token";
import { checkRateLimit, trustedClientIp } from "../rate-limit/token-bucket";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

export const VIEW_AS_CLAIMED = "user.view_as_claimed";

export const VIEW_AS_ENDED = "user.view_as_ended";

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

          const payload = verifyViewAsToken(ctx.body.token.trim());
          if (!payload) {
            throw new APIError("UNAUTHORIZED", { message: "INVALID_TOKEN" });
          }

          const claimed = await withPlatformContext(async (tx) => {
            const replay = await tx.auditLog.findFirst({
              where: {
                action: VIEW_AS_CLAIMED,
                afterState: { path: ["jti"], equals: payload.jti },
              },
              select: { id: true },
            });
            if (replay) return null;

            const actor = await tx.user.findUnique({
              where: { id: payload.act },
              select: { id: true, role: true, status: true, email: true },
            });
            if (!actor || actor.role !== "super_admin" || actor.status !== "active") {
              return null;
            }

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

            // L-05: `audit_logs_view_as_jti` (migration 78) makes this row
            // unique per token, so a concurrent second claim that slipped
            // past the findFirst above fails HERE, on insert, instead of
            // minting a second session. Prisma.$transaction aborts on the
            // error; the caller sees null like any other replay.
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
          }).catch((err: unknown) => {
            // L-05: the unique index refused a second audit row for this jti —
            // a concurrent replay. Same answer as the findFirst path.
            if ((err as { code?: string }).code === "P2002") return null;
            throw err;
          });

          if (!claimed) {
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
