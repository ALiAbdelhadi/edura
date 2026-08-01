import { auth } from "@/lib/auth/auth";
import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import {
  assertImpersonatable,
  auditImpersonationStart,
} from "@/lib/services/admin/admin-users";

export const dynamic = "force-dynamic";

/**
 * Start impersonating a BACK-OFFICE account (see boundary 2 in
 * services/admin/admin-users.ts). Two independent gates have to agree:
 * `assertImpersonatable` here, and better-auth's own `user:impersonate`
 * permission check — which additionally refuses admin-role targets because
 * the `impersonate-admins` statement was never granted.
 *
 * The audit row is written BEFORE the session swaps, while the actor is still
 * themselves; otherwise the actorId would be the impersonated user.
 */
export const POST = withErrors(async (req, ctx) => {
  const actor = await requireRole("super_admin");
  const { id } = await ctx.params;

  const target = await assertImpersonatable(actor, id);
  await auditImpersonationStart(actor, target);

  const { headers, response } = await auth.api.impersonateUser({
    body: { userId: id },
    headers: req.headers,
    returnHeaders: true,
  });

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
