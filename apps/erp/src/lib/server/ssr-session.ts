import "server-only";

import type { SessionUser } from "@repo/server-core/auth/types";
import { serviceGet } from "./service-fetch";

// What a server-rendered page used to read in-process from getSessionUser /
// isOnboardingComplete / getViewAsContext, now one service read per request
// (React cache() dedupes the layout's and the page's calls). Signed out is
// `user: null`, never a 401: the page decides where to send the visitor.
export type SsrSession = {
  user: SessionUser | null;
  onboardingComplete: boolean;
  viewAs: {
    actorId: string;
    actorName: string | null;
    actorEmail: string | null;
    expiresAt: string | null;
  } | null;
};

export async function ssrSession(): Promise<SsrSession> {
  const { data } = await serviceGet<SsrSession>("/api/v1/me/ssr-session");
  // The route never answers 4xx; a missing body is a broken service, not a
  // signed-out visitor.
  if (!data) throw new Error("ssr-session answered without a body");
  return data;
}
