import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { getInvoice } from "@repo/server-core/services/finance/invoices";
import { renderInvoicePdf } from "@repo/server-core/backoffice/finance/invoice-pdf";

export const GET = withRole(["accountant", "super_admin"], async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  const invoice = await getInvoice(id);
  const pdf = await renderInvoicePdf(invoice);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
});
