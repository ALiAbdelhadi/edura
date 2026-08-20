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
//   * ACCOUNT_PENDING / ACCOUNT_INACTIVE are revealed ONLY to someone who
//     proved ownership by typing the CORRECT password of a real www-role
//     account. They split one fact into two because the copy differs:
//     "awaiting review" is a promise, "suspended" is a sanction.
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
  // app on alternate localhost ports while NEXTAUTH_URL stays 3002. The ports
  // are NOT enumerated here — that list drifted from launch.json and turned a
  // valid sign-in into a 403 that looked like bad credentials. See
  // dev-origins.ts; it returns [] in production, so baseURL stays alone there.
  trustedOrigins: [baseURL, ...devLocalhostOrigins()],
  advanced: {
    cookiePrefix: SESSION_COOKIE_PREFIX,
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
      // The super admin behind a "view as" session, or null.
      //
      // DECLARED HERE OR IT DOES NOT EXIST. better-auth returns only the
      // session fields it knows about, so an undeclared column is silently
      // dropped from `getSession()` even though it is populated in the row.
      // That is not cosmetic: `session.ts` reads it to enforce the one-hour
      // view-as cap and the portal banner reads it to warn the operator, so
      // both fail OPEN and neither says anything. Found by driving the real
      // HTTP path — a unit-level proof of the cap passed the whole time,
      // because the predicate was correct and simply never received the value.
      // `input: false` for the same reason `centerId` has it: nothing a client
      // sends may set this.
      impersonatedBy: { type: "string", required: false, input: false },
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
    // `sendResetPassword` is DELIBERATELY NOT SET — see the note below.
  },

  // ==========================================================================
  // Outbound mail. Everything better-auth sends goes through @repo/notifications
  // so there is exactly one template set and one transport.
  //
  // WHY THERE IS NO `sendResetPassword` HERE:
  // better-auth ships a complete reset flow (forget-password -> reset-password)
  // backed by its own `auth_verifications` tokens. Wiring it would give this app
  // a SECOND way to set a password — and better-auth's writer does not bump
  // `users.token_version`, which is the write that fires the
  // `users_revoke_sessions` trigger. A reset down that path would leave every
  // pre-existing session alive, silently undoing L1.
  //
  // So password reset stays on `requestPasswordReset`/`resetPassword`
  // (@repo/server-core/services/auth/password-reset), which bumps the column in
  // the SAME transaction as the new hash. Leaving this option unset is what
  // keeps better-auth's endpoint inert: it errors rather than half-working.
  // Same reasoning as "ONE SUSPENSION MECHANISM" in CLAUDE.md.
  // ==========================================================================
  emailVerification: {
    // Address confirmation has NO competing implementation, so it is safe to
    // hand to better-auth. Note this only makes the endpoint functional — it
    // does NOT set `requireEmailVerification`, so no sign-in behaviour changes.
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
  // Defense-in-depth over the token buckets below (which are the C2
  // authority and Redis-backed). Strict on the credential endpoints.
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
          // AWAITING REVIEW IS NOT SUSPENSION. Both are "not active", so both
          // used to answer ACCOUNT_INACTIVE — and its copy says the account was
          // suspended and to contact support. A center or teacher who signed up
          // sixty seconds earlier was told, on the very next screen, that the
          // account they had just been promised was "under review" had been
          // suspended. Splitting the code discloses NOTHING new: it is reached
          // only after the correct password on a www-role account, the same
          // proof-of-ownership gate ACCOUNT_INACTIVE already sits behind.
          throw new APIError("FORBIDDEN", {
            message: user.status === "pending" ? "ACCOUNT_PENDING" : "ACCOUNT_INACTIVE",
          });
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
    // The back-office "view as" door (apps/superadmin -> here). It does NOT
    // relax the password door above: canSignIn("www", …) is untouched and a
    // super_admin still cannot type their way in. See view-as-plugin.ts.
    viewAsPlugin(),
    // Guided (optional) enrollment for center owners; enforcement for the
    // back-office roles lives in apps/superadmin.
    twoFactor({ issuer: "Edura" }),
    nextCookies(), // must stay last (docs) — cookie support for server actions
  ],
});

export type Auth = typeof auth;
