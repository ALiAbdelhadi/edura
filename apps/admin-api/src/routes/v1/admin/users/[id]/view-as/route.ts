import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { assertViewAsTarget, startViewAs } from "@repo/server-core/backoffice/admin/admin-users";

import { erpBaseUrl } from "@repo/server-core/backoffice/erp-base-url";

export const POST = withRole("super_admin", async (actor, _req, ctx) => {
  const { id } = await ctx.params;

  const target = await assertViewAsTarget(actor, id);
  const minted = await startViewAs(actor, target);

  return ok({
    claimUrl: `${erpBaseUrl()}/api/v1/auth/view-as/claim`,
    token: minted.token,
    expiresAt: minted.expiresAt.toISOString(),
    target: {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
    },
  });
});
