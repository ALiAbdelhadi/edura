import { prisma } from "@repo/database";
import {
  canSignIn,
  resolveLoginCenterId,
} from "@repo/server-core/auth/login-policy";
import { recordAuthEvent } from "@repo/server-core/services/auth/auth-audit";
import {
  DUMMY_HASH,
  hashPassword,
  verifyPassword,
} from "@repo/server-core/auth/passwords";
import { devLocalhostOrigins } from "@repo/server-core/auth/dev-origins";
import { send } from "@repo/notifications";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { checkRateLimit, trustedClientIp } from "@/lib/rate-limit/token-bucket";
import { SESSION_COOKIE_PREFIX } from "./cookie-prefix";
import { inviteTokenPlugin } from "./invite-token-plugin";
import { viewAsPlugin } from "./view-as-plugin";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — unchanged

const TWO_FACTOR_IP_CAP = 10;
const TWO_FACTOR_IP_RATE = 5;
const LOGIN_IP_CAP = 20;
const LOGIN_IP_RATE = 20;
const LOGIN_EMAIL_CAP = 5;
const LOGIN_EMAIL_RATE = 5;

const baseURL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const useSecureCookies = baseURL.startsWith("https://");
// SECURITY_AUDIT.md (2026-09-11) AUTH-09: a missing NEXTAUTH_URL in production
// used to mean plain-http cookies; refuse to boot instead.
if (process.env.VERCEL_ENV === "production" && !useSecureCookies) {
  throw new Error("NEXTAUTH_URL must be an https URL in production — cookies would otherwise be minted without Secure");
}

export const auth = betterAuth({
  appName: "Edura",
  baseURL,
  basePath: "/api/auth",
  secret: process.env.NEXTAUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: [baseURL, ...devLocalhostOrigins()],
  advanced: {
    cookiePrefix: SESSION_COOKIE_PREFIX,
    useSecureCookies,
    database: { generateId: false },
    ...(process.env.TRUSTED_CLIENT_IP_HEADER
      ? {
          ipAddress: {
            ipAddressHeaders: [process.env.TRUSTED_CLIENT_IP_HEADER],
          },
        }
      : {}),
  },
  session: {
    modelName: "authSession",
    expiresIn: SESSION_MAX_AGE,
    updateAge: 60 * 60 * 24,
    additionalFields: {
      centerId: { type: "string", required: false, input: false },
      impersonatedBy: { type: "string", required: false, input: false },
    },
  },
  account: { modelName: "authAccount" },
  verification: { modelName: "authVerification" },
  user: {
    additionalFields: {
      role: { type: "string", required: true, input: false },
      locale: { type: "string", required: false, defaultValue: "ar", input: false },
      status: { type: "string", required: false, defaultValue: "active", input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8, // L-07: registration/reset enforce passwordSchema; this is the floor for better-auth's own set-password paths
    password: { hash: hashPassword, verify: verifyPassword },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await send(
        "email_verification",
        {
          email: user.email,
          locale: (user as { locale?: string | null }).locale,
          userId: user.id,
        },
        { link: url, expiryHours: 1 },
      );
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/email": { window: 60, max: 20 },
      "/invite-token/claim": { window: 60, max: 10 },
      "/view-as/claim": { window: 60, max: 10 },
      "/two-factor/*": { window: 60, max: 15 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // SECURITY_AUDIT.md (2026-09-11) AUTH-04: better-auth's own
      // /change-password skips the letter+digit policy and never bumps
      // token_version (L1). The app's `me/password` door is the only one.
      if (ctx.request && ctx.path === "/change-password") {
        throw new APIError("NOT_FOUND", { message: "Not found" });
      }
      // AUTH-05: second-factor guesses are bounded in the SHARED store, not in
      // better-auth's per-lambda memory limiter.
      if (ctx.path.startsWith("/two-factor/verify")) {
        const ip = trustedClientIp((n) => ctx.headers?.get(n));
        if (!(await checkRateLimit(`2fa-ip:${ip}`, TWO_FACTOR_IP_CAP, TWO_FACTOR_IP_RATE))) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "RATE_LIMITED" });
        }
        return;
      }
      if (ctx.path !== "/sign-in/email") return;
      const body = ctx.body as { email?: string; password?: string } | undefined;
      const email = body?.email?.toLowerCase().trim();
      const password = body?.password ?? "";
      if (!email) return; // let the endpoint's own validation reject

      const ip = trustedClientIp((n) => ctx.headers?.get(n));
      if (!(await checkRateLimit(`login-ip:${ip}`, LOGIN_IP_CAP, LOGIN_IP_RATE))) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "RATE_LIMITED" });
      }
      if (
        !(await checkRateLimit(
          `login-email:${email}`,
          LOGIN_EMAIL_CAP,
          LOGIN_EMAIL_RATE,
        ))
      ) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "RATE_LIMITED" });
      }

      const user = await prisma.user.findFirst({ where: { email }, omit: { passwordHash: false } }); // DISC-01

      if (!user) {
        // SECURITY_AUDIT.md (2026-09-11) AUTH-01: same message as a wrong
        // password. The dummy-hash compare already equalised the timing; the
        // message was the remaining oracle for whether a child's email exists.
        await verifyPassword({ hash: DUMMY_HASH, password });
        void recordAuthEvent("auth.login_failed", { userId: null, ipAddress: ip, meta: { reason: "unknown_email" } }); // OPS-03
        throw new APIError("UNAUTHORIZED", { message: "Invalid email or password" });
      }

      const eligible =
        canSignIn("www", user.role) &&
        user.status === "active" &&
        !!user.passwordHash;
      if (!eligible) {
        const ownsInactiveAccount =
          !!user.passwordHash &&
          canSignIn("www", user.role) &&
          user.status !== "active" &&
          (await verifyPassword({ hash: user.passwordHash, password }));
        if (ownsInactiveAccount) {
          throw new APIError("FORBIDDEN", {
            message: user.status === "pending" ? "ACCOUNT_PENDING" : "ACCOUNT_INACTIVE",
          });
        }
        await verifyPassword({ hash: DUMMY_HASH, password });
        void recordAuthEvent("auth.login_failed", { userId: user.id, ipAddress: ip, meta: { reason: "ineligible", status: user.status } }); // OPS-03
        throw new APIError("UNAUTHORIZED", {
          message: "Invalid email or password",
        });
      }
    }),
    // OPS-03: a second factor switched on or off is a security event.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/two-factor/enable" && ctx.path !== "/two-factor/disable") return;
      const userId = ctx.context.session?.user?.id;
      if (!userId) return;
      void recordAuthEvent(
        ctx.path === "/two-factor/enable" ? "auth.two_factor_enabled" : "auth.two_factor_disabled",
        { userId, ipAddress: trustedClientIp((n) => ctx.headers?.get(n)) },
      );
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findFirst({
            where: { id: session.userId },
            select: { id: true, role: true },
          });
          const centerId = user
            ? await resolveLoginCenterId(user.role, user.id)
            : undefined;
          return { data: { ...session, centerId: centerId ?? null } };
        },
        // OPS-03: every session minted at the door is a login event.
        after: async (session) => {
          void recordAuthEvent("auth.login_succeeded", { userId: session.userId });
        },
      },
    },
  },
  plugins: [
    inviteTokenPlugin(),
    viewAsPlugin(),
    // SECURITY_AUDIT.md (2026-09-11) DB-03: the TOTP secret is encrypted by
    // default but backup codes were stored as plain JSON. Codes issued before
    // this change stay readable until regenerated (SECURITY_TODO.md).
    twoFactor({ issuer: "Edura", backupCodeOptions: { storeBackupCodes: "encrypted" } }),
    nextCookies(), // must stay last (docs) — cookie support for server actions
  ],
});

export type Auth = typeof auth;
