import { NextResponse } from "next/server";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { renderInvoiceHtml } from "@/lib/services/finance/invoices";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PRD §5.5 wants a Puppeteer-generated PDF (deferred — needs a PDF lib).
// For now we return a print-ready HTML document.
export const GET = withErrors(async (_req, ctx) => {
  await requireRole("accountant", "super_admin");
  const { id } = await ctx.params;
  const html = await renderInvoiceHtml(id);
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
});
