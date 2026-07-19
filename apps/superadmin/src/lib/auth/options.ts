import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import { checkRateLimit } from "@/lib/rate-limit/token-bucket";

// Roles allowed into the back-office app. Enforced at credential-check time —
// a valid www account (center/teacher/parent/student/assistant) can never mint
// a superadmin session, regardless of route guards.
const STAFF_ROLES = new Set(["super_admin", "accountant"]);

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
  const fwd = (req as { headers?: Record<string, string> } | undefined)?.headers?.[
    "x-forwarded-for"
  ];
  return (fwd ?? "").split(",")[0].trim() || "unknown";
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
        if (!checkRateLimit(`login-ip:${ip}`, LOGIN_IP_CAP, LOGIN_IP_RATE)) return null;
        if (!checkRateLimit(`login-email:${email}`, LOGIN_EMAIL_CAP, LOGIN_EMAIL_RATE)) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // H5: run bcrypt.compare UNCONDITIONALLY (real hash when eligible, else
        // DUMMY_HASH) so a nonexistent email and a wrong password share timing.
        const eligible =
          !!user &&
          STAFF_ROLES.has(user.role) &&
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
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
