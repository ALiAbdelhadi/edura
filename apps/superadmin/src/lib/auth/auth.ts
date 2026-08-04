import { prisma } from "@repo/database";
import { canSignIn } from "@repo/server-core/auth/login-policy";
import {
  DUMMY_HASH,
  hashPassword,
  verifyPassword,
} from "@repo/server-core/auth/passwords";
import { send } from "@repo/notifications";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { checkRateLimit, trustedClientIp } from "@/lib/rate-limit/token-bucket";
import { authBaseUrl, authSecret, superadminAuthSecret } from "@repo/server-core/auth/auth-env";

// ============================================================================
// better-auth instance — apps/superadmin (replaces NextAuth v4, 2026-08).
//
// Fully separated from apps/www: its own cookie prefix AND its own signing
// secret, so sessions are mutually invalid across apps even on one domain.
// The role partition (C-04) means only super_admin/accountant pass the
// before-hook; a www role can never mint a back-office session.
//
// FULL H5 semantics (unlike www): every failure is the same generic
// invalid-credentials error — no typed USER_NOT_FOUND here, staff accounts
// are the highest-value enumeration target.
//
// 2FA (TOTP + backup codes) is REQUIRED for both back-office roles: sign-in
// succeeds, but the dashboard layout refuses to render until the account has
// twoFactorEnabled — see the enrollment gate in the app layout.
// ============================================================================

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — unchanged

// C2: staff accounts get a strict backoff — small burst, ~1/min sustained.
const LOGIN_IP_CAP = 10;
const LOGIN_IP_RATE = 10;
const LOGIN_EMAIL_CAP = 5;
const LOGIN_EMAIL_RATE = 1;

const baseURL = authBaseUrl() ?? "http://localhost:3001";
const useSecureCookies = baseURL.startsWith("https://");

// Distinct signing secret (M2-style separation). Dev may fall back to the
// shared app secret; production must set the back office's own.
export const superadminSecret =
  superadminAuthSecret() ??
  (process.env.NODE_ENV !== "production" ? authSecret() : undefined);

export const auth = betterAuth({
  appName: "Edura Back Office",
  baseURL,
  basePath: "/api/auth",
  secret: superadminSecret,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Dev-only extra: the preview server in .claude/launch.json may run this
  // app on an alternate localhost port while the configured base URL stays 3004.
  trustedOrigins: [
    baseURL,
    ...(process.env.NODE_ENV !== "production"
      ? ["http://localhost:3004", "http://localhost:3037"]
      : []),
  ],
  advanced: {
    cookiePrefix: "edura-superadmin",
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
      // Shared auth_sessions table with www — the column exists; superadmin
      // sessions simply never set it.
      centerId: { type: "string", required: false, input: false },
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
    disableSignUp: true, // staff accounts are created by the back office only
    minPasswordLength: 1, // policy enforced at creation; sign-in accepts legacy
    password: { hash: hashPassword, verify: verifyPassword },
    // `sendResetPassword` is DELIBERATELY NOT SET, exactly as in apps/www:
    // better-auth's own reset writer does not bump `users.token_version`, so it
    // would set a password without firing the `users_revoke_sessions` trigger
    // and leave pre-existing sessions alive. Back-office resets go through
    // `requestPasswordReset` (@repo/server-core/services/auth/password-reset),
    // which the admin user directory already triggers.
  },
  emailVerification: {
    // No competing implementation, so better-auth owns it. Setting this does
    // NOT set `requireEmailVerification` — no sign-in behaviour changes.
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
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/two-factor/*": { window: 60, max: 10 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const body = ctx.body as { email?: string; password?: string } | undefined;
      const email = body?.email?.toLowerCase().trim();
      const password = body?.password ?? "";
      if (!email) return;

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

      const user = await prisma.user.findFirst({ where: { email } });
      const eligible =
        !!user &&
        canSignIn("superadmin", user.role) &&
        user.status === "active" &&
        !!user.passwordHash;
      if (!eligible) {
        // H5: one dummy compare, one generic failure — a nonexistent email, a
        // www role, a shell and a suspended staff account are indistinguishable.
        await verifyPassword({ hash: DUMMY_HASH, password });
        throw new APIError("UNAUTHORIZED", {
          message: "Invalid email or password",
        });
      }
      // Eligible: the endpoint runs the single real bcrypt compare against
      // the trigger-mirrored credential account.
    }),
  },
  plugins: [
    twoFactor({ issuer: "Edura Back Office" }),
    // Platform user management APIs (UI lands in a later workstream). Only
    // super_admin is an admin; accountant maps to the plain-user permission
    // set, so it gets NO admin API surface. The roles map is required by the
    // plugin whenever adminRoles uses non-default names.
    admin({
      adminRoles: ["super_admin"],
      roles: { super_admin: adminAc, accountant: userAc },
    }),
    nextCookies(), // must stay last
  ],
});

export type Auth = typeof auth;
