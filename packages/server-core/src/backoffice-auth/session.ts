import type { Role } from "@repo/database";
import { isSessionAmbiguous } from "../auth/session-cookies";
import type { SessionUser } from "../auth/types";
import { AuthError, SessionConflictError } from "../errors/classes";
import { requestHeaders } from "../http/request-context";
import { tagUser } from "../observability/user-tagger";
import { TwoFactorRequiredError } from "./errors";
import { adminAuth } from "./instance";
import { twoFactorSatisfied } from "./two-factor";
import { SESSION_COOKIE_PREFIX } from "./cookie-prefix";

export type { SessionUser };

type SessionOverride = () => Promise<SessionUser | null> | SessionUser | null;
let testOverride: SessionOverride | null = null;

export function __setSessionOverrideForTests(fn: SessionOverride | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setSessionOverrideForTests must never run in production");
  }
  testOverride = fn;
}

async function requestIsAmbiguous(): Promise<boolean> {
  try {
    const h = await requestHeaders();
    return isSessionAmbiguous(h.get("cookie"), SESSION_COOKIE_PREFIX);
  } catch {
    return false;
  }
}

type ReadSession = { user: SessionUser; twoFactorOk: boolean };

// One DB read per call, deliberately not memoised per request: the back office
// never read the session twice in one request, so a memo here would be new
// behaviour, not a move.
async function readSession(): Promise<ReadSession | null> {
  if (testOverride) {
    const user = await testOverride();
    return user ? { user, twoFactorOk: true } : null;
  }
  if (await requestIsAmbiguous()) {
    tagUser(null);
    return null;
  }
  const res = await adminAuth().api.getSession({ headers: (await requestHeaders()) as Headers });
  if (!res?.user?.id) {
    tagUser(null);
    return null;
  }
  const user = res.user as typeof res.user & {
    role: Role;
    locale: "ar" | "en";
    status?: string;
  };
  if (user.status && user.status !== "active") {
    tagUser(null);
    return null;
  }
  const sessionUser: SessionUser = {
    id: user.id,
    role: user.role,
    locale: user.locale ?? "ar",
    name: user.name ?? null,
    email: user.email ?? null,
  };
  tagUser(sessionUser);
  return {
    user: sessionUser,
    twoFactorOk: twoFactorSatisfied({
      twoFactorEnabled: (user as { twoFactorEnabled?: unknown }).twoFactorEnabled,
      impersonatedBy: (res.session as { impersonatedBy?: unknown } | undefined)?.impersonatedBy,
    }),
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  return (await readSession())?.user ?? null;
}

/**
 * Every /api/v1 route reaches the back office through here, so this is where the 2FA
 * requirement has to bite. The dashboard layout also redirects an unenrolled staff
 * member, but a redirect only guards a browser: without this check a password-only
 * session still reached every route directly.
 */
export async function requireSession(): Promise<SessionUser> {
  const session = await readSession();
  if (!session) {
    if (await requestIsAmbiguous()) throw new SessionConflictError();
    throw new AuthError();
  }
  if (!session.twoFactorOk) throw new TwoFactorRequiredError();
  return session.user;
}
