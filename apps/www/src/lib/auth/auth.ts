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
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { checkRateLimit, trustedClientIp } from "@/lib/rate-limit/token-bucket";
import { inviteTokenPlugin } from "./invite-token-plugin";

// ============================================================================
// better-auth instance — apps/www (replaces the NextAuth v4 options, 2026-08).
//
// What carried over UNCHANGED in behaviour:
//   * C-04: `canSignIn("www", role)` — the single shared role partition. A
//     back-office account (super_admin/accountant) can never mint a www
//     session; enforced in the before-hook below.
//   * C2: per-IP + per-email token buckets BEFORE any DB/bcrypt work (shared
//     Redis-backed limiter — M3).
//   * H5: bcrypt compares run on every path (DUMMY_HASH for the ineligible
//     ones) so timing never becomes an email-enumeration oracle. The one
//     Ali-approved www exception stands: a completely unknown email returns
//     the typed USER_NOT_FOUND (sign-up conversion UX), bounded by C2.
//   * ACCOUNT_INACTIVE is revealed ONLY to someone who proved ownership by
//     typing the CORRECT password of a real www-role account.
//   * Session claims: role/locale ride on the user row; centerId is resolved
//     at session creation by the SAME `resolveLoginCenterId` helper
//     (center_admin → profile, center_staff → live link) and stored on the
//     session row. Authoritative staff revocation stays requireCenterActor.
//
// What got STRONGER:
//   * Sessions are DB rows (auth_sessions), so L1 (password reset) and C-03
//     (suspend/blacklist/soft-delete) are now HARD revocation — the
//     users_revoke_sessions DB trigger deletes the rows atomically with the
//     deactivating write, even for SQL that never went through Prisma. The
//     old per-request `token_version` JWT re-read is superseded; the column
//     stays (writers still bump it — that bump is what fires the trigger).
//   * Passwords: users.password_hash remains the single source of truth
//     (bcrypt, cost 10 — NO forced resets); auth_accounts mirrors it via DB
//     triggers. better-auth verifies through the same bcryptjs.
// ============================================================================

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — unchanged

// C2: brute-force throttle (unchanged values). Per-IP is generous (shared
// NATs); per-email is the tight one that stops credential-stuffing.
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
  // Dev-only extras: the preview/dev servers in .claude/launch.json run this
  // app on alternate localhost ports while NEXTAUTH_URL stays 3002.
  trustedOrigins: [
    baseURL,
    ...(process.env.NODE_ENV !== "production"
      ? [
          "http://localhost:3002",
          "http://localhost:3021",
          "http://localhost:3022",
          "http://localhost:3042",
        ]
      : []),
  ],
  advanced: {
    cookiePrefix: "edura",
    useSecureCookies,
    // Postgres generates every id (gen_random_uuid) — consistent with the
    // whole schema, and user ids are never touched.
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
      // Session-scoped center claim (mirror of the old JWT claim).
      centerId: { type: "string", required: false, input: false },
    },
  },
  account: { modelName: "authAccount" },
  verification: { modelName: "authVerification" },
  user: {
    additionalFields: {
      role: { type: "string", required: true, input: false },
      locale: { type: "string", required: false, defaultValue: "ar", input: false },
      // Exposed so session readers can enforce C-03 without a second query.
      status: { type: "string", required: false, defaultValue: "active", input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Registration stays the custom /api/v1/auth/register/* flow.
    disableSignUp: true,
    // Sign-in must accept whatever legacy password the account has; password
    // POLICY is enforced by the custom register/reset/credentials flows.
    minPasswordLength: 1,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  // Defense-in-depth over the token buckets below (which are the C2
  // authority and Redis-backed). Strict on the credential endpoints.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/email": { window: 60, max: 20 },
      "/invite-token/claim": { window: 60, max: 10 },
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

      // C2: throttle BEFORE the DB/bcrypt work. The typed failure rides the
      // same budget — RATE_LIMITED fires whether or not the email exists.
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

      // Soft-deleted rows are filtered by the client extension, so a deleted
      // account is indistinguishable from a missing one — as before.
      const user = await prisma.user.findFirst({ where: { email } });

      if (!user) {
        // H5 (scoped decision, 2026-07-31): the www app tells a visitor when
        // an email has NO account at all — Ali-approved sign-up-conversion UX,
        // bounded by C2 above. Dummy compare keeps the timing path identical.
        await verifyPassword({ hash: DUMMY_HASH, password });
        throw new APIError("UNAUTHORIZED", { message: "USER_NOT_FOUND" });
      }

      const eligible =
        canSignIn("www", user.role) &&
        user.status === "active" &&
        !!user.passwordHash;
      if (!eligible) {
        // ACCOUNT_INACTIVE only for someone who proved ownership: correct
        // password on a real www-role account that is merely not active.
        const ownsInactiveAccount =
          !!user.passwordHash &&
          canSignIn("www", user.role) &&
          user.status !== "active" &&
          (await verifyPassword({ hash: user.passwordHash, password }));
        if (ownsInactiveAccount) {
          throw new APIError("FORBIDDEN", { message: "ACCOUNT_INACTIVE" });
        }
        // Staff roles, shells, wrong passwords: one dummy compare, one
        // generic failure — same shape as a plain wrong password.
        await verifyPassword({ hash: DUMMY_HASH, password });
        throw new APIError("UNAUTHORIZED", {
          message: "Invalid email or password",
        });
      }
      // Eligible + active: fall through to the endpoint, which looks up the
      // credential account (trigger-mirrored from users.password_hash) and
      // runs the single real bcrypt compare.
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Same resolver the NextAuth doors used (C-04): center_admin →
          // profile center, center_staff → live link, everyone else → none.
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
    // Guided (optional) enrollment for center owners; enforcement for the
    // back-office roles lives in apps/superadmin.
    twoFactor({ issuer: "Edura" }),
    nextCookies(), // must stay last (docs) — cookie support for server actions
  ],
});

export type Auth = typeof auth;
