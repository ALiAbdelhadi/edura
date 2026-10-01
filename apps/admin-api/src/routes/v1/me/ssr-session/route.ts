import { adminAuth } from "@repo/server-core/backoffice-auth/instance";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { requestHeaders } from "@repo/server-core/http/request-context";

// What the server-rendered dashboard layout used to read in-process through
// `auth.api.getSession({ headers })`, reduced to the two facts it decides on:
// who the caller is (with twoFactorEnabled) and whether the session is an
// impersonation. The session token and the rest of the row never leave the
// service. Signed out is a 200 with user: null, not a 401: the layout decides
// where to send the visitor. ok() marks the response no-store; this is
// per-user data.
export const GET = withErrors(async () => {
  const session = await adminAuth().api.getSession({ headers: (await requestHeaders()) as Headers });
  const user = session?.user as { id: string; twoFactorEnabled?: unknown } | undefined;
  const impersonatedBy = (session?.session as { impersonatedBy?: unknown } | undefined)?.impersonatedBy;
  return ok({
    user: user ? { id: user.id, twoFactorEnabled: Boolean(user.twoFactorEnabled) } : null,
    impersonated: Boolean(impersonatedBy),
  });
});
