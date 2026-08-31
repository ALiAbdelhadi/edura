"use client";

import { api, SESSION_INTEGRITY_EVENT, type SessionIntegrityReason } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import type { Role } from "@repo/database";
import { useEffect, useRef } from "react";

const PORTAL_FOR_ROLE: Record<Role, string | null> = {
  student: "student",
  parent: "parent",
  teacher: "teacher",
  assistant: "assistant",
  center_admin: "admin",
  center_staff: "staff",
  super_admin: null,
  accountant: null,
};

export function portalFromPath(pathname: string): string | null {
  const after = pathname.split("/dashboard/")[1];
  if (!after) return null;
  return after.split("/")[0] ?? null;
}

// Signed-in surfaces that live OUTSIDE /dashboard. A 401 here is a dead
// session, not the ordinary anonymous 401 of /login or /guardian/verify, so it
// must end the session instead of leaving the user silently un-authed.
const AUTHENTICATED_AREAS = ["/onboarding", "/claim", "/receipts", "/student-id"];

export function isAuthenticatedArea(pathname: string): boolean {
  const withoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
  return AUTHENTICATED_AREAS.some(
    (area) => withoutLocale === area || withoutLocale.startsWith(`${area}/`),
  );
}

export function resolveIntegrityAction(input: {
  reason: SessionIntegrityReason;
  portal: string | null;
  sessionRole: Role | null;
  authenticatedArea?: boolean;
}): "ignore" | "end-session" {
  if (input.reason === "session_conflict") return "end-session";

  if (input.reason === "session_expired") {
    return input.portal || input.authenticatedArea ? "end-session" : "ignore";
  }

  if (!input.portal) return "ignore";

  if (!input.sessionRole) return "end-session";

  return PORTAL_FOR_ROLE[input.sessionRole] === input.portal
    ? "ignore"
    : "end-session";
}

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
        sessionRole = await api
          .get("me")
          .json<{ data: { role: Role } }>()
          .then((me) => me.data.role)
          .catch(() => null);
      }
      const authenticatedArea = isAuthenticatedArea(window.location.pathname);
      if (
        resolveIntegrityAction({ reason, portal, sessionRole, authenticatedArea }) ===
        "ignore"
      ) {
        return;
      }

      handled.current = true;
      try {
        await authClient.signOut();
      } catch {
      }
      const locale = window.location.pathname.split("/")[1] || "ar";
      const notice =
        reason === "role_mismatch"
          ? "session_mismatch"
          : reason === "session_expired"
            ? "session_expired"
            : "session_conflict";
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
