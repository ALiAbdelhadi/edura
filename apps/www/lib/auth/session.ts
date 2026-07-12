import { getServerSession } from "next-auth/next";
import { authOptions } from "./options";
import { AuthError } from "@/lib/errors/classes";
import type { Role } from "@repo/database";

export type SessionUser = {
  id: string;
  role: Role;
  centerId?: string;
  locale: "ar" | "en";
  name?: string | null;
  email?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session.user as SessionUser;
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError();
  return user;
}
