import { auth } from "@/lib/auth/auth";
import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import {
  assertImpersonatable,
  auditImpersonationStart,
} from "@/lib/services/admin/admin-users";

export const dynamic = "force-dynamic";

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
