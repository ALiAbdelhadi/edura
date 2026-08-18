import { auth } from "@/lib/auth/auth";
import { getSessionUser } from "@/lib/auth/session";
import { AuthError, ValidationError } from "@/lib/errors/classes";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { auditImpersonationStop } from "@/lib/services/admin/admin-users";
import { headers as nextHeaders } from "next/headers";
import { APIError } from "better-auth/api";

export const dynamic = "force-dynamic";

/**
 * Stop impersonating and restore the admin's own session.
 *
 * Deliberately NOT guarded by requireRole("super_admin"): while impersonating,
 * the caller's effective role is the impersonated one, so that guard would
 * lock them inside the impersonation. The real gate is better-auth's own —
 * stop-impersonating only works on a session that carries `impersonatedBy`.
 */
export const POST = withErrors(async () => {
  const current = await getSessionUser();
  if (!current) throw new AuthError();

  // Read who is really behind this session before it swaps back.
  const session = await auth.api.getSession({ headers: await nextHeaders() });
  const impersonatedBy = (session?.session as { impersonatedBy?: string | null } | undefined)
    ?.impersonatedBy;

  // better-auth is the real gate here (see above) and it refuses a session that
  // carries no `impersonatedBy` with a TYPED APIError — statusCode 400,
  // "You are not impersonating anyone". Uncaught, that reached withErrors'
  // fallback branch and was served as a 500 and logged `[unhandled]`, so an
  // ordinary double-click on the Stop button paged whoever owns Sentry and
  // taught them to ignore alerts from an impersonation endpoint.
  //
  // Mapped to our own 400 with our own message rather than forwarding
  // better-auth's: the status is the one it intended, and no library internals
  // travel to the client. Anything that is NOT an APIError is genuinely
  // unexpected and still becomes a 500.
  let headers: Headers;
  let response: { user?: { id?: string } } | undefined;
  try {
    ({ headers, response } = await auth.api.stopImpersonating({
      headers: await nextHeaders(),
      returnHeaders: true,
    }));
  } catch (e) {
    if (e instanceof APIError) {
      throw new ValidationError("No impersonation is active for this session");
    }
    throw e;
  }

  if (impersonatedBy) {
    await auditImpersonationStop(impersonatedBy, current.id);
  }

  const res = ok({ stopped: true, restored: response?.user?.id ?? null });
  for (const cookie of headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
});
