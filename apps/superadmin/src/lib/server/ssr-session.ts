import "server-only";

import { serviceGet } from "./service-fetch";

// What the server-rendered dashboard layout used to read in-process from
// auth.api.getSession, reduced to the two facts it decides on: who the caller
// is (with 2FA enrolment) and whether the session is an impersonation. Signed
// out is `user: null`, never a 401: the layout decides where to send the
// visitor.
export type SsrSession = {
  user: { id: string; twoFactorEnabled: boolean } | null;
  impersonated: boolean;
};

export async function ssrSession(): Promise<SsrSession> {
  const { data } = await serviceGet<SsrSession>("/api/v1/me/ssr-session");
  // The route never answers 4xx; a missing body is a broken service, not a
  // signed-out visitor.
  if (!data) throw new Error("ssr-session answered without a body");
  return data;
}
