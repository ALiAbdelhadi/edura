import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma, withPlatformContext } from "@repo/database";
import { checkRateLimit } from "@/lib/rate-limit/token-bucket";

// www serves exactly these roles. Back-office staff (super_admin, accountant)
// sign in to apps/superadmin only — enforced here at credential-check time so
// a staff account can never mint a www session.
const WWW_ROLES = new Set([
  "center_admin",
  "teacher",
  "parent",
  "student",
  "assistant",
]);

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
  const fwd = (req as { headers?: Record<string, string> } | undefined)?.headers?.[
    "x-forwarded-for"
  ];
  return (fwd ?? "").split(",")[0].trim() || "unknown";
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
        if (!checkRateLimit(`login-ip:${ip}`, LOGIN_IP_CAP, LOGIN_IP_RATE)) return null;
        if (!checkRateLimit(`login-email:${email}`, LOGIN_EMAIL_CAP, LOGIN_EMAIL_RATE)) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // H5: run bcrypt.compare UNCONDITIONALLY — against the real hash when
        // the account is eligible, else against DUMMY_HASH — so a nonexistent
        // email and a real-but-wrong password take the same timing path.
        const eligible =
          !!user &&
          WWW_ROLES.has(user.role) &&
          user.status === "active" &&
          !!user.passwordHash;
        const passwordOk = await bcrypt.compare(
          credentials.password,
          eligible ? (user.passwordHash as string) : DUMMY_HASH,
        );
        if (!user || !eligible || !passwordOk) return null;

        let centerId: string | undefined;
        if (user.role === "center_admin") {
          const profile = await withPlatformContext((tx) =>
            tx.centerAdminProfile.findFirst({
              where: { userId: user.id },
              select: { centerId: true },
            }),
          );
          centerId = profile?.centerId ?? undefined;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          centerId,
          locale: user.locale,
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

        const fwd = (req as { headers?: Record<string, string> } | undefined)?.headers?.[
          "x-forwarded-for"
        ];
        const ip = (fwd ?? "").split(",")[0].trim() || "unknown";
        if (!checkRateLimit(`walkin-token:${ip}`, 10, 10)) return null;

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
          };
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.centerId = user.centerId;
        token.locale = user.locale;
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
