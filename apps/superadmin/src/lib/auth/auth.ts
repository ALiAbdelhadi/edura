import { prisma } from "@repo/database";
import { canSignIn } from "@repo/server-core/auth/login-policy";
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
import { admin, twoFactor } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { checkRateLimit, trustedClientIp } from "@/lib/rate-limit/token-bucket";
import { SESSION_COOKIE_PREFIX } from "./cookie-prefix";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — unchanged

const LOGIN_IP_CAP = 10;
const LOGIN_IP_RATE = 10;
const LOGIN_EMAIL_CAP = 5;
const LOGIN_EMAIL_RATE = 1;

const baseURL = process.env.NEXTAUTH_URL ?? "http://localhost:3001";
const useSecureCookies = baseURL.startsWith("https://");

export const superadminSecret =
  process.env.SUPERADMIN_NEXTAUTH_SECRET ??
  (process.env.NODE_ENV !== "production"
    ? process.env.NEXTAUTH_SECRET
    : undefined);

export const auth = betterAuth({
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
    minPasswordLength: 1, // policy enforced at creation; sign-in accepts legacy
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
        await verifyPassword({ hash: DUMMY_HASH, password });
        throw new APIError("UNAUTHORIZED", {
          message: "Invalid email or password",
        });
      }
    }),
  },
  plugins: [
    twoFactor({ issuer: "Edura Back Office" }),
    admin({
      adminRoles: ["super_admin"],
      roles: { super_admin: adminAc, accountant: userAc },
    }),
    nextCookies(), // must stay last
  ],
});

export type Auth = typeof auth;
