import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listInvoices, generateInvoice } from "@/lib/services/finance/invoices";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
  const p = new URL(req.url).searchParams;
  return ok(
    await listInvoices({
      type: p.get("type") ?? undefined,
      issuedToId: p.get("issued_to_id") ?? p.get("student_id") ?? p.get("teacher_id") ?? undefined,
      centerId: p.get("center_id") ?? undefined,
    }),
  );
});

const generateSchema = z.object({
  type: z.enum(["payment_receipt", "student_invoice", "teacher_statement", "center_statement"]),
  issuedToId: z.string().optional(),
  centerId: z.string().optional(),
  paymentId: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

export const POST = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
  const body = await parseJson(req, generateSchema);
  return ok(await generateInvoice(body), { status: 201 });
});
