import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listInvoices, generateInvoice } from "@/lib/services/finance/invoices";

export const dynamic = "force-dynamic";

export const GET = withRole(["accountant", "super_admin"], async (_user, req) => {
  const p = new URL(req.url).searchParams;
  return ok(
    await listInvoices({
      type: p.get("type") ?? undefined,
      issuedToId: p.get("issued_to_id") ?? p.get("student_id") ?? p.get("teacher_id") ?? undefined,
      centerId: p.get("center_id") ?? undefined,
      page: p.get("page"),
      limit: p.get("limit"),
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

export const POST = withRole(["accountant", "super_admin"], async (user, req) => {
  const body = await parseJson(req, generateSchema);
  return ok(await generateInvoice(body, user), { status: 201 });
});
