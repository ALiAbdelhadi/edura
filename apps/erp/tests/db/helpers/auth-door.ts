// Shared driver for the REAL better-auth pipeline in db proof suites.
// Replaces the old pattern of calling the NextAuth provider's authorize() +
// jwt()/session() callbacks directly: every call here goes through the full
// stack — before-hooks (C2 rate limits, C-04 partition, H5 timing, typed
// errors), the credential verify against the trigger-mirrored account row,
// session-row creation (with the centerId enrichment hook), and cookie
// issuance. "A later request carrying the session" is a real getSession with
// the real cookie — so the DB revocation trigger is what these proofs exercise.
import { auth } from "@/lib/auth/auth";
import { APIError } from "better-auth/api";

let ipCounter = 0;

/** Fresh IP per call so the per-IP C2 bucket never trips across a suite. */
export function freshIp(): string {
  ipCounter += 1;
  return `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

export type DoorResult =
  | { ok: true; token: string; cookie: string; user: Record<string, unknown> }
  | { ok: false; status: number; message: string };

function cookieFromHeaders(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .join("; ");
}

/** Sign in through the full better-auth /sign-in/email pipeline. */
export async function signInDoor(
  email: string,
  password: string,
  opts: { ip?: string } = {},
): Promise<DoorResult> {
  try {
    const { headers, response } = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers({
        "x-forwarded-for": opts.ip ?? freshIp(),
        "user-agent": "db-proof-suite",
      }),
      returnHeaders: true,
    });
    return {
      ok: true,
      token: response.token ?? "",
      cookie: cookieFromHeaders(headers),
      user: response.user as unknown as Record<string, unknown>,
    };
  } catch (e) {
    if (e instanceof APIError) {
      return {
        ok: false,
        status: e.statusCode,
        message: (e.body as { message?: string } | undefined)?.message ?? "",
      };
    }
    throw e;
  }
}

/** Claim an invite token through the full plugin pipeline. */
export async function claimDoor(
  token: string,
  opts: { ip?: string } = {},
): Promise<DoorResult> {
  try {
    const { headers, response } = await auth.api.claimInviteToken({
      body: { token },
      headers: new Headers({
        "x-forwarded-for": opts.ip ?? freshIp(),
        "user-agent": "db-proof-suite",
      }),
      returnHeaders: true,
    });
    return {
      ok: true,
      token: response.token,
      cookie: cookieFromHeaders(headers),
      user: response.user as unknown as Record<string, unknown>,
    };
  } catch (e) {
    if (e instanceof APIError) {
      return {
        ok: false,
        status: e.statusCode,
        message: (e.body as { message?: string } | undefined)?.message ?? "",
      };
    }
    throw e;
  }
}

/**
 * "A later request carrying this session": real getSession against the real
 * cookie. Returns the effective session (null = logged out).
 */
export async function sessionFor(cookie: string): Promise<{
  userId: string;
  role: string;
  centerId?: string;
  locale?: string;
} | null> {
  const res = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  if (!res?.user?.id) return null;
  const u = res.user as { id: string; role?: string; locale?: string };
  const s = res.session as { centerId?: string | null };
  return {
    userId: u.id,
    role: (u.role as string) ?? "",
    centerId: s.centerId ?? undefined,
    locale: u.locale,
  };
}

/**
 * Spend a back-office "view as" handoff token through the full plugin
 * pipeline. Same shape as claimDoor, but the response carries no top-level
 * session token — the whole point of this door is the COOKIE it sets and the
 * `impersonated_by` stamp on the row behind it, so both of those are what a
 * caller inspects.
 */
export async function viewAsDoor(
  token: string,
  opts: { ip?: string } = {},
): Promise<
  | { ok: true; cookie: string; user: Record<string, unknown> }
  | { ok: false; status: number; message: string }
> {
  try {
    const { headers, response } = await auth.api.claimViewAs({
      body: { token },
      headers: new Headers({
        "x-forwarded-for": opts.ip ?? freshIp(),
        "user-agent": "db-proof-suite",
      }),
      returnHeaders: true,
    });
    return {
      ok: true,
      cookie: cookieFromHeaders(headers),
      user: (response as { user: unknown }).user as Record<string, unknown>,
    };
  } catch (e) {
    if (e instanceof APIError) {
      return {
        ok: false,
        status: e.statusCode,
        message: (e.body as { message?: string } | undefined)?.message ?? "",
      };
    }
    throw e;
  }
}

/**
 * The RAW better-auth session behind a cookie — not the narrowed shape
 * `sessionFor` returns.
 *
 * It exists for one class of bug: better-auth returns only the session fields
 * the app DECLARES, so a column that is populated in the row is silently
 * dropped from `getSession()` unless it is listed in `session.additionalFields`.
 * `impersonatedBy` was exactly that — the one-hour view-as cap and the portal
 * banner both read it, both failed open, and neither said anything, while a
 * unit-level proof of the cap passed because the predicate was fine and simply
 * never got the value. Narrowing helpers hide this; this one does not.
 */
export async function rawSessionFor(
  cookie: string,
): Promise<Record<string, unknown> | null> {
  const res = await auth.api.getSession({ headers: new Headers({ cookie }) });
  return (res?.session as Record<string, unknown> | undefined) ?? null;
}
