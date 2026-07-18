import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";

// Roles allowed into the back-office app. Enforced at credential-check time —
// a valid www account (center/teacher/parent/student/assistant) can never mint
// a superadmin session, regardless of route guards.
const STAFF_ROLES = new Set(["super_admin", "accountant"]);

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user) return null;
        if (!STAFF_ROLES.has(user.role)) return null;
        if (user.status !== "active") return null;
        if (!user.passwordHash) return null;

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;

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
