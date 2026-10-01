import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { recordPayment, listPayments } from "@repo/server-core/services/payments/payments";

export const GET = withErrors(async (req) => {
  const user = await requireSession();

  const url = new URL(req.url);
  const filters = {
    studentId: url.searchParams.get("studentId") ?? undefined,
    courseId: url.searchParams.get("courseId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };

  const payments = await listPayments(filters, user);
  return ok(payments);
});

const createSchema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().optional(),
  // Positive only. A refund goes to POST /payments/[id]/refund, which is the
  // one door that can link, bound and audit it (REFUND_DECISION.md §2.0).
  amount: moneySchema.refine((v) => v > 0, "Amount must be positive"),
  note: z.string().optional(),
  paymentMethod: z.enum(["cash", "instapay", "pos_card", "mobile_wallet"]).optional(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const data = await parseJson(req, createSchema);
  const payment = await recordPayment(data, user);
  return ok(payment, { status: 201 });
});
