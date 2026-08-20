import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role } from "@repo/database";

/**
 * THE CROSS-APP HANDOFF TOKEN — the one door a back-office `super_admin` uses
 * to enter apps/erp as an ERP user ("view as").
 *
 * WHY A TOKEN AT ALL, AND NOT JUST A SESSION.
 * The two apps carry deliberately different cookie names AND different signing
 * secrets (`edura` vs `edura-superadmin`), so a session minted in the back
 * office is unreadable by the ERP BY CONSTRUCTION — that separation is load
 * bearing and is NOT being removed. `login-policy.ts` is likewise untouched:
 * `canSignIn("www", "super_admin")` still answers false, so the password door
 * on the ERP keeps refusing back-office accounts exactly as it did.
 *
 * What this module adds is a SECOND, narrower door, and everything about it is
 * chosen so that holding the door does not mean holding the keys:
 *
 *   1. SIGNED. HMAC-SHA256 over the exact payload bytes with a dedicated
 *      secret. Nothing in the payload is trusted before the signature verifies,
 *      and the compare is `timingSafeEqual`.
 *   2. SHORT-LIVED. 60 seconds. The token is minted and immediately POSTed by
 *      the browser that asked for it; a minute is enormous for that and useless
 *      for anything else.
 *   3. BOUND TO ONE TARGET AND ONE ACTOR. Both ids are inside the signed
 *      payload, so a token for a student can never open a centre, and the ERP
 *      records WHO is behind the session without trusting a header.
 *   4. SINGLE-USE, best effort. A `jti` rides along and the ERP refuses a jti
 *      it has already recorded in `audit_logs`. Stated honestly: that check is
 *      a read-then-write, not a unique index, so two requests inside the same
 *      millisecond could both pass. It is a backstop on top of (2) — the real
 *      gates are the signature and the sixty seconds, and adding a table for a
 *      one-minute nonce was not worth a migration.
 *
 * THE SECRET MUST BE IDENTICAL ON BOTH APPS. Same class of operational hazard
 * as `STUDENT_QR_SECRET`: superadmin signs, the ERP verifies, and a mismatch
 * looks exactly like a forged token. It is required in production and fails
 * closed — a handoff silently signed with a guessable value is worse than one
 * that cannot be issued, because the failure is invisible until someone walks
 * in through it.
 */

/** Seconds a minted token stays valid. Deliberately tiny — see (2) above. */
export const VIEW_AS_TOKEN_TTL_SECONDS = 60;

/** How long the resulting ERP session lives before it expires on its own. */
export const VIEW_AS_SESSION_TTL_SECONDS = 60 * 60;

export type ViewAsPayload = {
  /** The ERP user being entered. */
  sub: string;
  /** The back-office `super_admin` behind the session. */
  act: string;
  /** The target's role at mint time — advisory; the ERP re-reads it. */
  role: Role;
  /** Nonce, for the single-use backstop. */
  jti: string;
  /** Issued-at, epoch seconds. */
  iat: number;
  /** Expiry, epoch seconds. */
  exp: number;
};

function viewAsSecret(): string {
  const value = process.env.VIEW_AS_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "VIEW_AS_SECRET is required in production (back-office 'view as' handoff tokens are signed with it, and BOTH apps must carry the same value)",
    );
  }
  return "edura-development-view-as-secret";
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function unb64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", viewAsSecret()).update(body).digest());
}

/**
 * Mint a handoff token. Called ONLY by apps/superadmin, and only after its own
 * `super_admin` + target checks have passed — this module signs what it is
 * given and makes no authorization decision of its own.
 */
export function mintViewAsToken(input: {
  targetUserId: string;
  actorUserId: string;
  targetRole: Role;
}): { token: string; jti: string; expiresAt: Date } {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + VIEW_AS_TOKEN_TTL_SECONDS;
  const jti = randomBytes(16).toString("hex");
  const payload: ViewAsPayload = {
    sub: input.targetUserId,
    act: input.actorUserId,
    role: input.targetRole,
    jti,
    iat,
    exp,
  };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, jti, expiresAt: new Date(exp * 1000) };
}

/**
 * Verify a handoff token and return its payload, or null.
 *
 * Returns null for EVERY failure — bad shape, bad signature, expired, garbage —
 * on purpose: the caller answers one opaque refusal, so a probe cannot learn
 * which part it got wrong. Never throws on malformed input.
 */
export function verifyViewAsToken(token: string | null | undefined): ViewAsPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];
  if (!body || !signature) return null;

  let expected: Buffer;
  let given: Buffer;
  try {
    expected = unb64url(sign(body));
    given = unb64url(signature);
  } catch {
    return null;
  }
  if (expected.length !== given.length) return null;
  if (!timingSafeEqual(expected, given)) return null;

  let payload: ViewAsPayload;
  try {
    payload = JSON.parse(unb64url(body).toString("utf8")) as ViewAsPayload;
  } catch {
    return null;
  }
  if (
    typeof payload?.sub !== "string" ||
    typeof payload?.act !== "string" ||
    typeof payload?.jti !== "string" ||
    typeof payload?.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp * 1000 < Date.now()) return null;
  return payload;
}

/**
 * HAS THIS VIEW-AS WINDOW RUN OUT?
 *
 * A separate predicate rather than an inline check inside the session reader,
 * for one reason: `auth_sessions.expires_at` cannot enforce this and a proof
 * suite has to be able to say so. better-auth refreshes `expires_at` on read
 * (a 30-day `expiresIn` with a 1-day `updateAge`), so the one-hour stamp the
 * claim endpoint writes is pushed back out to thirty days by the first request
 * that reads it — measured, not assumed. `created_at` is never refreshed, so it
 * is what the window is measured from.
 *
 * Returns false for an ordinary session: only a row carrying `impersonatedBy`
 * has a window to run out.
 */
export function isViewAsExpired(session: {
  impersonatedBy?: string | null;
  createdAt?: Date | string | null;
}): boolean {
  if (!session.impersonatedBy || !session.createdAt) return false;
  const age = Date.now() - new Date(session.createdAt).getTime();
  return age > VIEW_AS_SESSION_TTL_SECONDS * 1000;
}
