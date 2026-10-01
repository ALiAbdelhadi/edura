import { prisma } from "@repo/database";
import { canSignIn } from "../auth/login-policy";
import { recordAuthEvent } from "../services/auth/auth-audit";
import {
  DUMMY_HASH,
  hashPassword,
  verifyPassword,
} from "../auth/passwords";
import { devLocalhostOrigins } from "../auth/dev-origins";
import { send } from "@repo/notifications";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, twoFactor } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { checkRateLimit, trustedClientIp } from "../rate-limit/token-bucket";
import { SESSION_COOKIE_PREFIX } from "./cookie-prefix";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — unchanged

/**
 * Admin-plugin endpoints that are sealed off from the HTTP surface.
 *
 * Each has an audited equivalent in the back office that the raw endpoint bypasses:
 * impersonation here skips assertImpersonatable (refuse self, refuse ERP roles) and
 * writes no audit row; set-user-password would let a super_admin take over any ERP
 * account with no `impersonated_by` marker on the resulting session; ban/unban write
 * better-auth's `banned` columns, which the one-suspension-mechanism rule says are
 * never written and which do not fire the users_revoke_sessions trigger; remove-user
 * hard-deletes where this codebase soft-deletes.
 *
 * Only the HTTP surface is sealed. Server-side `auth.api.*` calls carry no
 * ctx.request, so the back office's own audited routes still reach the plugin.
 *
 * SECURITY_AUDIT.md (2026-09-11) ADMIN-01: this used to be a list of seven
 * paths, and the plugin ships fifteen. The unsealed `update-user` took a free
 * `data` object straight to the adapter — `twoFactorEnabled`, `status`,
 * `email`, the `banned` columns — with no 2FA gate (that gate covers
 * `/api/v1/**`, not `/api/auth/**`) and no audit row. A list can only ever be
 * as complete as the plugin version it was written against, so the seal is
 * now the whole `/admin/` prefix; nothing in the back office calls the plugin over
 * HTTP (`authClient.admin.*` has no callers), and the sealing test enumerates
 * the plugin's own endpoint table so a new path cannot appear unsealed.
 */
const SEALED_ADMIN_PREFIX = "/admin/";

const TWO_FACTOR_IP_CAP = 10;
const TWO_FACTOR_IP_RATE = 5;
const LOGIN_IP_CAP = 10;
const LOGIN_IP_RATE = 10;
const LOGIN_EMAIL_CAP = 5;
const LOGIN_EMAIL_RATE = 1;

const baseURL = process.env.NEXTAUTH_URL ?? "http://localhost:3001";
const useSecureCookies = baseURL.startsWith("https://");
if (process.env.VERCEL_ENV === "production" && !useSecureCookies) {
  throw new Error("NEXTAUTH_URL must be an https URL in production — cookies would otherwise be minted without Secure"); // AUTH-09
}

export const superadminSecret =
  process.env.SUPERADMIN_NEXTAUTH_SECRET ??
  (process.env.NODE_ENV !== "production"
    ? process.env.NEXTAUTH_SECRET
    : undefined);

// The back-office better-auth instance, options identical for every host. It is
// a second door with its own cookie prefix and 2FA gate, never merged with the
// ERP's createErpAuth. The Next app appends nextCookies() through `extraPlugins`
// (it must stay last); a service passes its own cookie plugin or none.
export function createAdminAuth(opts: { extraPlugins: BetterAuthPlugin[] }) {
  return betterAuth({
    appName: "Edura Back Office",
    baseURL,
    basePath: "/api/auth",
    secret: superadminSecret,
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
      minPasswordLength: 8, // L-07: sign-in is unaffected (length is checked on set, not verify)
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
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/two-factor/*": { window: 60, max: 10 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // 404 rather than 403: a sealed endpoint should not advertise that it exists.
        if (ctx.request && ctx.path.startsWith(SEALED_ADMIN_PREFIX)) {
          throw new APIError("NOT_FOUND", { message: "Not found" });
        }
        // AUTH-04 / AUTH-05 — see erp-auth/create-auth.ts.
        if (ctx.request && ctx.path === "/change-password") {
          throw new APIError("NOT_FOUND", { message: "Not found" });
        }
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

        const user = await prisma.user.findFirst({ where: { email }, omit: { passwordHash: false } }); // DISC-01
        const eligible =
          !!user &&
          canSignIn("superadmin", user.role) &&
          user.status === "active" &&
          !!user.passwordHash;
        if (!eligible) {
          await verifyPassword({ hash: DUMMY_HASH, password });
          void recordAuthEvent("auth.login_failed", { userId: user?.id ?? null, ipAddress: ip, meta: { reason: user ? "ineligible" : "unknown_email" } }); // OPS-03
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid email or password",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/two-factor/enable" && ctx.path !== "/two-factor/disable") return;
        const userId = ctx.context.session?.user?.id;
        if (!userId) return;
        void recordAuthEvent(
          ctx.path === "/two-factor/enable" ? "auth.two_factor_enabled" : "auth.two_factor_disabled",
          { userId, ipAddress: trustedClientIp((n) => ctx.headers?.get(n)) },
        ); // OPS-03
      }),
    },
    plugins: [
      // SECURITY_AUDIT.md (2026-09-11) DB-03 — see erp-auth/create-auth.ts.
      twoFactor({
        issuer: "Edura Back Office",
        backupCodeOptions: { storeBackupCodes: "encrypted" },
      }),
      admin({
        adminRoles: ["super_admin"],
        roles: { super_admin: adminAc, accountant: userAc },
      }),
      ...opts.extraPlugins,
    ],
  });
}

export type AdminAuth = ReturnType<typeof createAdminAuth>;
