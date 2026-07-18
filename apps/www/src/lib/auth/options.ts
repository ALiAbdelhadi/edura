import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma, withPlatformContext } from "@repo/database";

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user) return null;
        if (!WWW_ROLES.has(user.role)) return null;
        if (user.status !== "active") return null;
        if (!user.passwordHash) return null;

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;

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
