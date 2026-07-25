import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma, withPlatformContext } from "@repo/database";
import { canSignIn, resolveLoginCenterId } from "@repo/server-core/auth/login-policy";
import { checkRateLimit, trustedClientIp } from "@/lib/rate-limit/token-bucket";

// C-04: the allowlist is NOT declared here. `canSignIn("www", role)` reads the
// single shared partition in @repo/server-core/auth/login-policy, which this
// door and the manual POST /api/v1/auth/login door both consult — they can no
// longer drift. Back-office staff (super_admin, accountant) map to the
// superadmin app there, so they can never mint a www session.

// H5: a valid bcrypt hash of a random string. Compared against when the account
// is missing/ineligible so login timing is identical to a real wrong-password
// attempt (no email-enumeration oracle). Never matches a real password.
const DUMMY_HASH = "$2b$10$wrFkXDBP7l73KSdBAgzutOaGQi9FZfAP/69GAeqzK0AiUDGWqhpsW";

// C2: brute-force throttle on the login door (token bucket = burst capacity +
// sustained refill/min). Per-IP is generous (shared NATs); per-email is the
// tight one that stops credential-stuffing a single account.
const LOGIN_IP_CAP = 20;
const LOGIN_IP_RATE = 20;
const LOGIN_EMAIL_CAP = 5;
const LOGIN_EMAIL_RATE = 5;

function clientIp(req: unknown): string {
  const headers = (req as { headers?: Record<string, string> } | undefined)?.headers;
  // M3: trusted proxy hop, not the spoofable leftmost XFF entry.
  return trustedClientIp((n) => headers?.[n]);
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.toLowerCase().trim();

        // C2: per-IP + per-email throttle BEFORE the DB/bcrypt work.
        const ip = clientIp(req);
        if (!(await checkRateLimit(`login-ip:${ip}`, LOGIN_IP_CAP, LOGIN_IP_RATE))) return null;
        if (!(await checkRateLimit(`login-email:${email}`, LOGIN_EMAIL_CAP, LOGIN_EMAIL_RATE))) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // H5: run bcrypt.compare UNCONDITIONALLY — against the real hash when
        // the account is eligible, else against DUMMY_HASH — so a nonexistent
        // email and a real-but-wrong password take the same timing path.
        const eligible =
          !!user &&
          canSignIn("www", user.role) &&
          user.status === "active" &&
          !!user.passwordHash;
        const passwordOk = await bcrypt.compare(
          credentials.password,
          eligible ? (user.passwordHash as string) : DUMMY_HASH,
        );
        if (!user || !eligible || !passwordOk) return null;

        // Shared with the REST login door (C-04): center_admin resolves its
        // profile's center, center_staff its live (removed_at IS NULL) link.
        // The AUTHORITATIVE staff revocation check still lives in
        // requireCenterActor, re-resolved per request, so a deactivated staff
        // member loses access on the next request regardless of the 30-day JWT.
        const centerId = await resolveLoginCenterId(user.role, user.id);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          centerId,
          locale: user.locale,
          tokenVersion: user.tokenVersion, // L1: session epoch at issue time
        };
      },
    }),
    /**
     * Step 7 — walk-in claim (passwordless, DELIBERATELY NARROW).
     * A second login door for exactly one case: a walk-in student opening the
     * one-time WhatsApp link. Enforced here, all of them:
     *   1. purpose === walk_in_onboarding only — no other invite purpose;
     *   2. token unused + unexpired, and consumed ATOMICALLY (single-use);
     *   3. resolves only to role=student in shell/active status with NO
     *      passwordHash — a credentialed account can never be entered this way;
     *   4. the status-gate relaxation lives in THIS provider only; the normal
     *      credentials provider above is untouched;
     *   5. rate-limited per IP against brute force (tokens are 256-bit anyway).
     */
    CredentialsProvider({
      id: "walkin-token",
      name: "Walk-in claim",
      credentials: { token: { label: "Token", type: "text" } },
      async authorize(credentials, req) {
        const token = credentials?.token?.trim();
        if (!token || token.length < 32) return null;

        const ip = clientIp(req);
        if (!(await checkRateLimit(`walkin-token:${ip}`, 10, 10))) return null;

        const tokenHash = createHash("sha256").update(token).digest("hex");

        return withPlatformContext(async (tx) => {
          const row = await tx.inviteToken.findUnique({ where: { tokenHash } });
          if (!row) return null;
          if (row.purpose !== "walk_in_onboarding") return null; // (1)
          if (row.usedAt) return null; // (2)
          if (row.expiresAt.getTime() < Date.now()) return null; // (2)
          if (!row.userId) return null;

          const user = await tx.user.findUnique({ where: { id: row.userId } });
          if (!user) return null;
          if (user.role !== "student") return null; // (3)
          if (user.status !== "shell" && user.status !== "active") return null; // (3)
          if (user.passwordHash !== null) return null; // (3) no account takeover

          // (2) atomic single-use: only one concurrent claim can flip usedAt.
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

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            centerId: undefined,
            locale: user.locale,
            tokenVersion: user.tokenVersion, // L1: session epoch at issue time
          };
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Fresh sign-in: stamp the token with the account's current epoch.
        token.uid = user.id;
        token.role = user.role;
        token.centerId = user.centerId;
        token.locale = user.locale;
        token.ver = user.tokenVersion;
        return token;
      }
      // L1: every subsequent request re-checks the token's epoch against the
      // DB. A password reset/change bumps users.token_version, so any token
      // minted before it now trails the column and is rejected here (all
      // claims stripped → the session callback yields no user → logged out).
      // A missing row (deleted user) invalidates too. Unbumped accounts read
      // back the same value, so normal sessions are untouched.
      //
      // C-03: the SAME per-request read now also re-reads the LIVE account
      // state (one query, no extra cost). Every login door already requires
      // status='active', so a session can only ever have been minted for an
      // active account — meaning anything else here is a suspension, a
      // blacklist or a soft-delete that happened DURING the session, and the
      // very next request is rejected instead of writing for up to 30 days.
      // This is the authoritative gate: it holds even for a status change that
      // never went through Prisma (a manual SQL fix, a future call site).
      // findUnique is deliberately not soft-delete-filtered, so deletedAt is
      // checked explicitly.
      if (token?.uid) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.uid },
          select: { tokenVersion: true, status: true, deletedAt: true },
        });
        if (
          !fresh ||
          fresh.tokenVersion !== (token.ver ?? 0) ||
          fresh.status !== "active" ||
          fresh.deletedAt !== null
        ) {
          // Strip every claim: the encoded cookie carries no uid, so the
          // session callback yields no user → the request is unauthenticated.
          return {} as typeof token;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.uid) {
        session.user = {
          ...session.user,
          id: token.uid,
          role: token.role,
          centerId: token.centerId,
          locale: token.locale,
        };
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
