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
 * THE server-side session surface. Every route/component reads the session
 * through these two helpers (58 call sites) — their signatures are the stable
 * contract the other workstreams code against; the swap from NextAuth to
 * better-auth changed nothing above this line.
 *
 * C-03 note: hard revocation happens at the DB (users_revoke_sessions trigger
 * deletes auth_sessions rows on suspend/soft-delete/token_version bump), so a
 * live session row implies a live account. The status check here is
 * belt-and-braces for the same request window the write happened in.
 */
type SessionOverride = () => Promise<SessionUser | null> | SessionUser | null;
let testOverride: SessionOverride | null = null;

/**
 * TEST-ONLY seam. The db proof suites invoke route handlers directly (no Next
 * request scope), so they inject the session at this edge — the same seam the
 * old suites patched by overriding next-auth's getServerSession (better-auth
 * is ESM, so module-patching is no longer possible). Refuses to arm outside
 * tests; production behaviour is byte-for-byte the real session read.
 */
export function __setSessionOverrideForTests(fn: SessionOverride | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setSessionOverrideForTests must never run in production");
  }
  testOverride = fn;
}

/**
 * Did this request present more than one identity?
 *
 * Read from the raw header rather than from better-auth, because better-auth
 * answers with ONE session — the question here is whether there was a choice to
 * make at all. Never throws: outside a request scope (the db suites call route
 * handlers directly) `headers()` is unavailable, and a guard that broke those
 * would be removed within a day.
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
  // FAIL CLOSED BEFORE RESOLVING. Two credentials means the answer depends on
  // cookie order, which is the browser's business and changes without anyone
  // acting — so there is no honest identity to return here, and returning the
  // first one is exactly how a parent's screen ended up executing as a centre
  // admin (docs/reports/session-identity-mismatch.md).
  if (await requestIsAmbiguous()) {
    tagSentryUser(null);
    return null;
  }
  const res = await auth.api.getSession({ headers: await headers() });
  if (!res?.user?.id) {
    // Clear any identity left on a reused server instance's scope.
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
  const centerId =
    (res.session as { centerId?: string | null }).centerId ?? undefined;
  const sessionUser: SessionUser = {
    id: user.id,
    role: user.role,
    centerId,
    locale: user.locale ?? "ar",
    name: user.name ?? null,
    email: user.email ?? null,
  };
  // Tag HERE, at the one session surface, so every route gets it without
  // remembering to. Only the id/role/centerId travel — never name or email,
  // and nothing at all for a minor. Never throws.
  tagSentryUser(sessionUser);
  return sessionUser;
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    // Same 401 either way, but the CODE differs, because the remedies are
    // opposite: sign in, versus sign out to clear the surplus credential.
    if (await requestIsAmbiguous()) throw new SessionConflictError();
    throw new AuthError();
  }
  return user;
}
