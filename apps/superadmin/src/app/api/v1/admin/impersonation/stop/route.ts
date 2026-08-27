import { auth } from "@/lib/auth/auth";
import { getSessionUser } from "@/lib/auth/session";
import { AuthError, ValidationError } from "@/lib/errors/classes";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { auditImpersonationStop } from "@/lib/services/admin/admin-users";
import { headers as nextHeaders } from "next/headers";
import { APIError } from "better-auth/api";

export const dynamic = "force-dynamic";

export const POST = withErrors(async () => {
  const current = await getSessionUser();
  if (!current) throw new AuthError();

  const session = await auth.api.getSession({ headers: await nextHeaders() });
  const impersonatedBy = (session?.session as { impersonatedBy?: string | null } | undefined)
    ?.impersonatedBy;

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
