import { createHash } from "node:crypto";
import { withPlatformContext } from "@repo/database";
import { CLAIMABLE, isClaimPurpose } from "@/lib/services/invites/invite-token";
import { checkRateLimit, trustedClientIp } from "@/lib/rate-limit/token-bucket";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

export const inviteTokenPlugin = () => {
  return {
    id: "invite-token",
    endpoints: {
      claimInviteToken: createAuthEndpoint(
        "/invite-token/claim",
        {
          method: "POST",
          body: z.object({ token: z.string() }),
        },
        async (ctx) => {
          const token = ctx.body.token.trim();
          if (!token || token.length < 32) {
            throw new APIError("UNAUTHORIZED", { message: "INVALID_TOKEN" });
          }

          const ip = trustedClientIp((n) => ctx.headers?.get(n));
          if (!(await checkRateLimit(`invite-token:${ip}`, 10, 10))) {
            throw new APIError("TOO_MANY_REQUESTS", { message: "RATE_LIMITED" });
          }

          const tokenHash = createHash("sha256").update(token).digest("hex");

          const claimed = await withPlatformContext(async (tx) => {
            const row = await tx.inviteToken.findUnique({ where: { tokenHash } });
            if (!row) return null;
            if (!isClaimPurpose(row.purpose)) return null; // (1)
            const spec = CLAIMABLE[row.purpose];
            if (row.usedAt) return null; // (2)
            if (row.expiresAt.getTime() < Date.now()) return null; // (2)
            if (!row.userId) return null;

            const user = await tx.user.findUnique({ where: { id: row.userId } });
            if (!user) return null;
            if (user.role !== spec.role) return null; // (1)+(3) purpose owns the role
            if (user.status !== "shell" && user.status !== "active") return null; // (3)
            if (user.passwordHash !== null) return null; // (3) no account takeover
            if (user.deletedAt) return null; // (3)

            if (spec.role === "assistant") {
              const link = await tx.teacherAssistant.findFirst({
                where: { assistantId: user.id, removedAt: null },
                select: { id: true },
              });
              if (!link) return null;
            }
            if (spec.role === "center_staff") {
              const link = await tx.centerStaff.findFirst({
                where: { staffUserId: user.id, removedAt: null },
                select: { id: true },
              });
              if (!link) return null;
            }
            if (spec.role === "teacher") {
              const profile = await tx.teacherProfile.findUnique({
                where: { userId: user.id },
                select: { systemStatus: true },
              });
              if (!profile || profile.systemStatus !== "enrolled") return null;
              const link = await tx.centerTeacherAffiliation.findFirst({
                where: { teacherId: user.id, status: "active" },
                select: { id: true },
              });
              if (!link) return null;
            }

            const consumed = await tx.inviteToken.updateMany({
              where: { id: row.id, usedAt: null },
              data: { usedAt: new Date() },
            });
            if (consumed.count !== 1) return null;

            if (user.status === "shell") {
              await tx.user.update({
                where: { id: user.id },
                data: { status: "active" },
              });
            }

            return { userId: user.id, role: user.role };
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
          const user = await ctx.context.internalAdapter.findUserById(
            claimed.userId,
          );
          if (!user) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "SESSION_CREATE_FAILED",
            });
          }
          await setSessionCookie(ctx, { session, user });

          return ctx.json({
            token: session.token,
            user: { id: claimed.userId, role: claimed.role },
          });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
};
