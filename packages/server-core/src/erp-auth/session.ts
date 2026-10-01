import type { Role } from "@repo/database";
import { isSessionAmbiguous } from "../auth/session-cookies";
import { isViewAsExpired } from "../auth/view-as-token";
import type { SessionUser } from "../auth/types";
import { AuthError, SessionConflictError } from "../errors/classes";
import { requestHeaders, requestMemo } from "../http/request-context";
import { tagUser } from "../observability/user-tagger";
import { readAuthSession } from "./read-session";
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

export async function getSessionUser(): Promise<SessionUser | null> {
  // The override stays OUTSIDE the memoised body: a test that swaps it mid-run
  // must take effect immediately, and memoising it would pin the first answer
  // for the rest of the request.
  if (testOverride) return await testOverride();
  return resolveSessionUser();
}

const resolveSessionUser = requestMemo(async (): Promise<SessionUser | null> => {
  if (await requestIsAmbiguous()) {
    tagUser(null);
    return null;
  }
  const res = await readAuthSession();
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
  const sessionRow = res.session as {
    centerId?: string | null;
    impersonatedBy?: string | null;
    createdAt?: Date | string | null;
  };
  if (isViewAsExpired(sessionRow)) {
    tagUser(null);
    return null;
  }

  const centerId = sessionRow.centerId ?? undefined;
  const sessionUser: SessionUser = {
    id: user.id,
    role: user.role,
    centerId,
    locale: user.locale ?? "ar",
    name: user.name ?? null,
    email: user.email ?? null,
  };
  tagUser(sessionUser);
  return sessionUser;
});

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    if (await requestIsAmbiguous()) throw new SessionConflictError();
    throw new AuthError();
  }
  return user;
}
