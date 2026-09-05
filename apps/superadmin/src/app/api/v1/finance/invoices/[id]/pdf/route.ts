import { NextResponse } from "next/server";
import { withRole } from "@/lib/authz/require-role";
import { getInvoice } from "@/lib/services/finance/invoices";
import { renderInvoicePdf } from "@/lib/services/finance/invoice-pdf";

export const dynamic = "force-dynamic";

export const GET = withRole(["accountant", "super_admin"], async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  const invoice = await getInvoice(id);
  const pdf = await renderInvoicePdf(invoice);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
});
