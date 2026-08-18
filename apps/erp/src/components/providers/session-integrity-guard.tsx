"use client";

import { api, SESSION_INTEGRITY_EVENT, type SessionIntegrityReason } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import type { Role } from "@repo/database";
import { useEffect, useRef } from "react";

/**
 * Which portal folder a role's screens live in. Mirrors the `/dashboard/*`
 * routes; `center_admin` is the CENTER portal (`/dashboard/admin`), which is
 * the naming trap CLAUDE.md warns about — it is not the back office.
 */
const PORTAL_FOR_ROLE: Record<Role, string | null> = {
  student: "student",
  parent: "parent",
  teacher: "teacher",
  assistant: "assistant",
  center_admin: "admin",
  center_staff: "staff",
  // Back-office roles have no www portal at all; a www session holding one is
  // itself the anomaly this guard exists to end.
  super_admin: null,
  accountant: null,
};

export function portalFromPath(pathname: string): string | null {
  const after = pathname.split("/dashboard/")[1];
  if (!after) return null;
  return after.split("/")[0] ?? null;
}

/**
 * THE DECISION, as a pure function — because it is the part that can be wrong
 * in a way nobody notices.
 *
 * Ending someone's session is destructive: get it too eager and a routing bug
 * of ours logs a teacher out mid-lesson; get it too shy and a parent keeps
 * looking at a screen wearing their name while the server serves somebody else.
 * Inside a `useEffect` neither direction is testable, so the rule lives here and
 * `session-integrity.test.ts` pins all five branches.
 *
 * `sessionRole` is what `/api/v1/me` just answered — `null` when that read
 * itself failed, which counts as "the identity is unreadable", not as consent
 * to keep rendering it.
 */
export function resolveIntegrityAction(input: {
  reason: SessionIntegrityReason;
  portal: string | null;
  sessionRole: Role | null;
}): "ignore" | "end-session" {
  // The server refused to guess between two credentials. There is no confirming
  // read to make — `me` would refuse for the same reason.
  if (input.reason === "session_conflict") return "end-session";

  // An expired session, and the ONE branch where "not on a portal screen" is
  // load-bearing rather than merely tidy: the login screen itself reads `me`
  // and is answered 401, every time, correctly. Acting on that would send the
  // login page to the login page, for ever. So expiry is only ever acted on
  // where a portal is being rendered — somewhere that is currently claiming an
  // identity the server has just denied. No confirming read: `me` is precisely
  // the call that returned 401.
  if (input.reason === "session_expired") {
    return input.portal ? "end-session" : "ignore";
  }

  // Not on a portal screen: nothing here claims an identity, so a 403 is just a
  // 403 and belongs to the screen that asked for it.
  if (!input.portal) return "ignore";

  // The identity could not be read at all.
  if (!input.sessionRole) return "end-session";

  // The session's own portal IS the one being rendered: this refusal was about
  // one route, not about who is signed in. Our bug, not their session.
  return PORTAL_FOR_ROLE[input.sessionRole] === input.portal
    ? "ignore"
    : "end-session";
}

/**
 * THE SCREEN AND THE SESSION MUST NAME THE SAME PERSON.
 *
 * On 2026-08-09 they did not: the parent portal rendered a father's name, his
 * children and his wallet, while the server executed his next click as a centre
 * admin and refused it with an English string he could not read. The cause is
 * recorded in docs/reports/session-identity-mismatch.md — two session cookies
 * in one jar, whichever came first winning.
 *
 * This guard is the client half of the fix, and it is deliberately narrow:
 *
 *  - `session_conflict` (the server refused to guess): sign out and send them
 *    to the login screen with a plain sentence. Signing OUT is the repair —
 *    it is what clears the surplus credential; sending them to login without it
 *    would hand the same ambiguity straight back.
 *  - `role_mismatch`: CONFIRM FIRST. A 403 for the wrong role can also mean a
 *    plain routing bug in our own UI, and logging someone out for our mistake
 *    is a worse failure than the error message. So `me` is re-read: only when
 *    the session's role disagrees with the portal being rendered is this an
 *    identity problem, and only then is the session ended.
 *
 * Fires once (`handled`), because several queries on a screen refuse together
 * and one is enough — a second sign-out mid-redirect only races the first.
 */
export function SessionIntegrityGuard() {
  const handled = useRef(false);

  useEffect(() => {
    const onIntegrity = async (event: Event) => {
      if (handled.current) return;
      const reason = (event as CustomEvent<{ reason: SessionIntegrityReason }>)
        .detail?.reason;
      if (!reason) return;

      const portal = portalFromPath(window.location.pathname);
      let sessionRole: Role | null = null;
      if (reason === "role_mismatch" && portal) {
        // CONFIRM BEFORE ENDING ANYTHING. A wrong-role 403 can equally be a
        // routing bug of ours, and logging someone out for our mistake is the
        // worse failure of the two.
        sessionRole = await api
          .get("me")
          .json<{ data: { role: Role } }>()
          .then((me) => me.data.role)
          .catch(() => null);
      }

      if (resolveIntegrityAction({ reason, portal, sessionRole }) === "ignore") {
        return;
      }

      handled.current = true;
      try {
        await authClient.signOut();
      } catch {
        // A sign-out that cannot reach the server must not strand the reader on
        // a screen wearing someone else's name — the redirect happens either way.
      }
      const locale = window.location.pathname.split("/")[1] || "ar";
      // The reason travels, because the login screen states it back to the
      // reader. A role mismatch is NOT "your browser held two sessions" — it
      // held one, belonging to somebody else — and a safety notice that
      // describes the wrong thing is worse than a vague one. An expiry is
      // neither: nothing was wrong with the browser or the account, the session
      // simply ran out, and telling that reader about credentials would invent
      // a security incident out of the passage of time.
      const notice =
        reason === "role_mismatch"
          ? "session_mismatch"
          : reason === "session_expired"
            ? "session_expired"
            : "session_conflict";

      // Only an expiry carries the reader back. The other two end a session
      // BECAUSE the screen they were on could not be trusted to name them, so
      // returning them to it is the last thing to do; an expiry has no such
      // doubt, and losing someone's place for a timeout is a small cruelty the
      // login screen already has the `next` parameter to avoid.
      const params = new URLSearchParams({ reason: notice });
      if (reason === "session_expired") {
        params.set("next", window.location.pathname + window.location.search);
      }
      window.location.assign(`/${locale}/login?${params.toString()}`);
    };

    window.addEventListener(SESSION_INTEGRITY_EVENT, onIntegrity);
    return () => window.removeEventListener(SESSION_INTEGRITY_EVENT, onIntegrity);
  }, []);

  return null;
}
