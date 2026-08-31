"use client";

import { authClient } from "@/lib/auth/client";
import { useEffect, useRef } from "react";

export function SessionExpiryGuard() {
  const handled = useRef(false);

  useEffect(() => {
    const onAuthError = async () => {
      if (handled.current) return;
      const path = window.location.pathname;
      if (!path.includes("/dashboard")) return;
      handled.current = true;
      try {
        await authClient.signOut();
      } catch {
      }
      const locale = path.split("/")[1] || "ar";
      window.location.assign(`/${locale}/login?reason=session_expired`);
    };

    window.addEventListener("edura:auth-error", onAuthError);
    return () => window.removeEventListener("edura:auth-error", onAuthError);
  }, []);

  return null;
}
