import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { sendInvoiceEmail } from "@/lib/services/finance/invoices";

export const dynamic = "force-dynamic";

export const POST = withRole(["accountant", "super_admin"], async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await sendInvoiceEmail(id));
});
