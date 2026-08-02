import { headers } from "next/headers";
import type { Role } from "@repo/database";
import type { SessionUser } from "@repo/server-core/auth/types";
import { AuthError } from "@/lib/errors/classes";
import { tagSentryUser } from "@/lib/observability/sentry-user";
import { auth } from "./auth";

export type { SessionUser };

/**
 * THE server-side session surface (stable contract — signatures unchanged by
 * the better-auth swap). Hard revocation happens at the DB: the
 * users_revoke_sessions trigger deletes auth_sessions rows on suspend /
 * soft-delete / token_version bump; the status check here is belt-and-braces.
 */
type SessionOverride = () => Promise<SessionUser | null> | SessionUser | null;
let testOverride: SessionOverride | null = null;

/**
 * TEST-ONLY seam. See apps/www/src/lib/auth/session.ts — same rationale: the
 * db proof suites inject the session at this edge (better-auth is ESM, so the
 * old getServerSession module-patch is not possible). Refuses in production.
 */
export function __setSessionOverrideForTests(fn: SessionOverride | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setSessionOverrideForTests must never run in production");
  }
  testOverride = fn;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (testOverride) return await testOverride();
  const res = await auth.api.getSession({ headers: await headers() });
  if (!res?.user?.id) {
    tagSentryUser(null);
    return null;
  }
  const user = res.user as typeof res.user & {
    role: Role;
    locale: "ar" | "en";
    status?: string;
  };
  if (user.status && user.status !== "active") {
    tagSentryUser(null);
    return null;
  }
  const sessionUser: SessionUser = {
    id: user.id,
    role: user.role,
    locale: user.locale ?? "ar",
    name: user.name ?? null,
    email: user.email ?? null,
  };
  // Tag at the one session surface — id/role only, never name or email.
  // Back-office roles are adults, so they are always identified (unlike www,
  // where every `student` is treated as a minor and never is).
  tagSentryUser(sessionUser);
  return sessionUser;
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError();
  return user;
}
