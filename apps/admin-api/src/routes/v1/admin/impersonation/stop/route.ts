import { adminAuth } from "@repo/server-core/backoffice-auth/instance";
import { getSessionUser } from "@repo/server-core/backoffice-auth/session";
import { AuthError, ValidationError } from "@repo/server-core/errors/classes";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { requestHeaders } from "@repo/server-core/http/request-context";
import { auditImpersonationStop } from "@repo/server-core/backoffice/admin/admin-users";
import { APIError } from "better-auth/api";

export const POST = withErrors(async () => {
  const current = await getSessionUser();
  if (!current) throw new AuthError();

  const session = await adminAuth().api.getSession({ headers: (await requestHeaders()) as Headers });
  const impersonatedBy = (session?.session as { impersonatedBy?: string | null } | undefined)
    ?.impersonatedBy;

  let headers: Headers;
  let response: { user?: { id?: string } } | undefined;
  try {
    ({ headers, response } = await adminAuth().api.stopImpersonating({
      headers: (await requestHeaders()) as Headers,
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
