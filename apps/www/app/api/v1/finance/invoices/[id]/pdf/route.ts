import { NextResponse } from "next/server";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { getInvoice } from "@/lib/services/finance/invoices";
import { renderInvoicePdf } from "@/lib/services/finance/invoicePdf";

export const dynamic = "force-dynamic";

// PRD §5.5 — genuine server-generated PDF (pdf-lib, no headless browser).
export const GET = withErrors(async (_req, ctx) => {
  await requireRole("accountant", "super_admin");
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
