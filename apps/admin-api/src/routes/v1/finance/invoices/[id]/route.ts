import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getInvoice } from "@repo/server-core/services/finance/invoices";

export const GET = withRole(["accountant", "super_admin"], async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await getInvoice(id));
});
