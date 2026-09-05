"use client";

import { SESSION_INTEGRITY_EVENT, type SessionIntegrityReason } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import { useEffect, useRef } from "react";

// The back office has no per-role portals, so unlike the ERP guard there is no
// portal/role comparison here: role_mismatch never fires (requireRole in this
// app throws without a reason detail) and is deliberately ignored if it ever
// does. session_conflict ends the session anywhere — the server could not tell
// which account this browser holds. session_expired only matters inside
// /dashboard; the login page's own anonymous 401s must not bounce the user.
export function resolveIntegrityAction(input: {
  reason: SessionIntegrityReason;
  onDashboard: boolean;
}): "ignore" | "end-session" {
  if (input.reason === "session_conflict") return "end-session";
  if (input.reason === "session_expired") {
    return input.onDashboard ? "end-session" : "ignore";
  }
  return "ignore";
}

export function SessionIntegrityGuard() {
  const handled = useRef(false);

  useEffect(() => {
    const onIntegrity = async (event: Event) => {
      if (handled.current) return;
      const reason = (event as CustomEvent<{ reason: SessionIntegrityReason }>)
        .detail?.reason;
      if (!reason) return;

      const onDashboard = window.location.pathname.includes("/dashboard");
      if (resolveIntegrityAction({ reason, onDashboard }) === "ignore") return;

      handled.current = true;
      try {
        await authClient.signOut();
      } catch {
      }
      const locale = window.location.pathname.split("/")[1] || "ar";
      const notice = reason === "session_conflict" ? "session_conflict" : "session_expired";
      window.location.assign(`/${locale}/login?reason=${notice}`);
    };

    window.addEventListener(SESSION_INTEGRITY_EVENT, onIntegrity);
    return () => window.removeEventListener(SESSION_INTEGRITY_EVENT, onIntegrity);
  }, []);

  return null;
}
