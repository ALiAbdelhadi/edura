import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { getSessionUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/authz/requireRole";
import { requireCenterScope } from "@/lib/authz/requireCenterScope";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { getPayment } from "@/lib/services/payments/payments";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("Not authenticated");

  const paymentId = ((await ctx?.params) as { id: string }).id;
  const payment = await getPayment(paymentId, user);
  return ok(payment);
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["paid", "failed"],
  paid: ["refunded"],
};

const patchSchema = z.object({
  status: z.enum(["pending", "paid", "failed", "refunded"]),
});

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const { status: newStatus } = await parseJson(req, patchSchema);

  const paymentId = ((await ctx?.params) as { id: string }).id;

  const updated = await scopedDb(user, async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundError("Payment not found");
    requireCenterScope(user, payment.centerId);

    const currentStatus = payment.status || "paid";
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BusinessRuleError(`Cannot transition from ${currentStatus} to ${newStatus}`);
    }

    return tx.payment.update({ where: { id: paymentId }, data: { status: newStatus } });
  });

  return ok(updated);
});
