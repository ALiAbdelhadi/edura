import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { getSessionUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { signedMoneySchema } from "@/lib/validation/common";
import { ForbiddenError } from "@/lib/errors/classes";
import { recordPayment, listPayments } from "@/lib/services/payments/payments";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("Not authenticated");

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
  // Signed integer minor units, bounded per PRD §8.3; non-zero enforced in service.
  amount: signedMoneySchema,
  note: z.string().optional(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const data = await parseJson(req, createSchema);
  const payment = await recordPayment(data, user);
  return ok(payment, { status: 201 });
});
