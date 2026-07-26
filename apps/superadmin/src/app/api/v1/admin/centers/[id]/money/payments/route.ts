import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { adminListPayments, adminRecordPayment } from "@/lib/services/admin/center-money";

// A SANCTIONED money flow: recording cash taken at the counter writes a Payment
// with a receipt and a mirrored Transaction, in one transaction. It is not a
// ledger edit — the append-only REVOKEs are untouched by it.
export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    studentId: z.uuid(),
    courseId: z.uuid().optional(),
    // Positive only. Returning money is the refund flow, not a negative payment.
    amount: moneySchema.positive(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const GET = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await adminListPayments(user, id, q));
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, createSchema);
  return ok(await adminRecordPayment(user, id, body), { status: 201 });
});
