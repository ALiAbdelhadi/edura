import { prisma } from "@repo/database";
import {
  canSignIn,
  resolveLoginCenterId,
} from "@repo/server-core/auth/login-policy";
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

const LOGIN_IP_CAP = 20;
const LOGIN_IP_RATE = 20;
const LOGIN_EMAIL_CAP = 5;
const LOGIN_EMAIL_RATE = 5;

const baseURL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const useSecureCookies = baseURL.startsWith("https://");

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

      const user = await prisma.user.findFirst({ where: { email } });

      if (!user) {
        await verifyPassword({ hash: DUMMY_HASH, password });
        throw new APIError("UNAUTHORIZED", { message: "USER_NOT_FOUND" });
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
        throw new APIError("UNAUTHORIZED", {
          message: "Invalid email or password",
        });
      }
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
      },
    },
  },
  plugins: [
    inviteTokenPlugin(),
    viewAsPlugin(),
    twoFactor({ issuer: "Edura" }),
    nextCookies(), // must stay last (docs) — cookie support for server actions
  ],
});

export type Auth = typeof auth;
