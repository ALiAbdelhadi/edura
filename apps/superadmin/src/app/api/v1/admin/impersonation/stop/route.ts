import { auth } from "@/lib/auth/auth";
import { getSessionUser } from "@/lib/auth/session";
import { AuthError } from "@/lib/errors/classes";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { auditImpersonationStop } from "@/lib/services/admin/admin-users";
import { headers as nextHeaders } from "next/headers";

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

  const { headers, response } = await auth.api.stopImpersonating({
    headers: await nextHeaders(),
    returnHeaders: true,
  });

  if (impersonatedBy) {
    await auditImpersonationStop(impersonatedBy, current.id);
  }

  const res = ok({ stopped: true, restored: response?.user?.id ?? null });
  for (const cookie of headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
});
