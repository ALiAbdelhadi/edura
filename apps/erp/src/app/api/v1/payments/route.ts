import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema } from "@/lib/validation/common";
import { recordPayment, listPayments } from "@/lib/services/payments/payments";

export const dynamic = "force-dynamic";

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
