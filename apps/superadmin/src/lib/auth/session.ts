import { headers } from "next/headers";
import type { Role } from "@repo/database";
import { isSessionAmbiguous } from "@repo/server-core/auth/session-cookies";
import type { SessionUser } from "@repo/server-core/auth/types";
import { AuthError, SessionConflictError } from "@/lib/errors/classes";
import { tagSentryUser } from "@/lib/observability/sentry-user";
import { auth } from "./auth";
import { SESSION_COOKIE_PREFIX } from "./cookie-prefix";

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

/**
 * Did this request present more than one identity? Mirror of the www guard
 * (apps/www/src/lib/auth/session.ts) — the two apps share the kernel, and the
 * back office needs it MORE, not less: the roles behind this door can read
 * every centre's money.
 */
async function requestIsAmbiguous(): Promise<boolean> {
  try {
    const h = await headers();
    return isSessionAmbiguous(h.get("cookie"), SESSION_COOKIE_PREFIX);
  } catch {
    return false;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (testOverride) return await testOverride();
  // Two credentials means the resolved identity depends on cookie order. There
  // is no honest answer to return, so return none.
  if (await requestIsAmbiguous()) {
    tagSentryUser(null);
    return null;
  }
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
  if (!user) {
    if (await requestIsAmbiguous()) throw new SessionConflictError();
    throw new AuthError();
  }
  return user;
}
