import { adminAuth } from "@repo/server-core/backoffice-auth/instance";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import {
  assertImpersonatable,
  auditImpersonationStart,
} from "@repo/server-core/backoffice/admin/admin-users";

export const POST = withRole("super_admin", async (actor, req, ctx) => {
  const { id } = await ctx.params;

  const target = await assertImpersonatable(actor, id);

  // The audit row is written AFTER better-auth actually mints the impersonated
  // session, not before: a failure in impersonateUser used to leave behind an
  // audit claiming a start that never happened, which is worse than a missing
  // row -- a reader cannot tell it apart from a real one.
  const { headers, response } = await adminAuth().api.impersonateUser({
    body: { userId: id },
    headers: req.headers,
    returnHeaders: true,
  });
  await auditImpersonationStart(actor, target);

  const res = ok({
    impersonating: {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
    },
    session: { expiresAt: response.session?.expiresAt ?? null },
  });
  for (const cookie of headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
});
