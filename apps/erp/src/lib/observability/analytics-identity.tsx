"use client";

import { useEffect } from "react";
import type { SessionLike } from "@repo/observability";
import { identifyUser } from "./posthog-client";

export function AnalyticsIdentity({ session }: { session: SessionLike }) {
  useEffect(() => {
    identifyUser(session);
  }, [session.id, session.role, session.centerId]);

  return null;
}
