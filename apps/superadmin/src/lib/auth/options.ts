import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import { canSignIn } from "@repo/server-core/auth/login-policy";
import { checkRateLimit, trustedClientIp } from "@/lib/rate-limit/token-bucket";

// Roles allowed into the back-office app come from the SAME shared partition
// the www doors use (@repo/server-core/auth/login-policy) — see C-04. Because
// that map assigns every Role to exactly one app, a www account
// (center_admin/center_staff/teacher/assistant/parent/student) can never mint a
// superadmin session, and a new role cannot silently land in both apps.

// H5: bcrypt hash of a random string — compared against for missing/ineligible
// accounts so login timing is identical to a real wrong-password attempt.
const DUMMY_HASH = "$2b$10$wrFkXDBP7l73KSdBAgzutOaGQi9FZfAP/69GAeqzK0AiUDGWqhpsW";

// C2: brute-force throttle. Staff accounts (super_admin/accountant) are the
// highest-value targets, so the per-email limit is a strict backoff — a small
// burst then ~1/min sustained — much tighter than www.
const LOGIN_IP_CAP = 10;
const LOGIN_IP_RATE = 10;
const LOGIN_EMAIL_CAP = 5;
const LOGIN_EMAIL_RATE = 1;

function clientIp(req: unknown): string {
  const headers = (req as { headers?: Record<string, string> } | undefined)?.headers;
  // M3: trusted proxy hop, not the spoofable leftmost XFF entry.
  return trustedClientIp((n) => headers?.[n]);
}

// Sessions are fully separated from apps/www: distinct cookie names AND a
// distinct signing secret, so tokens are mutually invalid across apps even
// when both run on one domain.
const useSecureCookies = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

export const superadminSecret =
  process.env.SUPERADMIN_NEXTAUTH_SECRET ??
  (process.env.NODE_ENV !== "production"
    ? process.env.NEXTAUTH_SECRET
    : undefined);

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  secret: superadminSecret,
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}edura-superadmin.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}edura-superadmin.callback-url`,
      options: { sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    csrfToken: {
      name: `${useSecureCookies ? "__Host-" : ""}edura-superadmin.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
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

        // H5: run bcrypt.compare UNCONDITIONALLY (real hash when eligible, else
        // DUMMY_HASH) so a nonexistent email and a wrong password share timing.
        const eligible =
          !!user &&
          canSignIn("superadmin", user.role) &&
          user.status === "active" &&
          !!user.passwordHash;
        const passwordOk = await bcrypt.compare(
          credentials.password,
          eligible ? (user.passwordHash as string) : DUMMY_HASH,
        );
        if (!user || !eligible || !passwordOk) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          locale: user.locale,
          tokenVersion: user.tokenVersion, // L1: session epoch at issue time
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Fresh sign-in: stamp the token with the account's current epoch.
        token.uid = user.id;
        token.role = user.role;
        token.locale = user.locale;
        token.ver = user.tokenVersion;
        return token;
      }
      // L1: revalidate the token's epoch against the DB on every request so a
      // password reset/change (which bumps users.token_version, shared across
      // both apps) also revokes a stolen super_admin/accountant session. A
      // trailing or missing version strips all claims → the session callback
      // yields no user → logged out. Unchanged accounts are untouched.
      //
      // C-03: the same read also re-checks the LIVE account state (one query),
      // so suspending, blacklisting or soft-deleting a super_admin/accountant
      // kills their back-office session on the very NEXT request rather than
      // at JWT expiry. authorize() already requires status='active', so
      // anything else here is a deactivation that happened mid-session.
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
