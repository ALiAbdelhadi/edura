import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { NotFoundError, BusinessRuleError } from "@repo/server-core/errors/classes";
import { paymentsMode } from "@repo/server-core/services/payments/gateway/index";
import { mockCompletePaymentIntent } from "@repo/server-core/services/payments/mock-complete";

const bodySchema = z.object({ outcome: z.enum(["success", "failure"]) }).strict();

export const POST = withErrors(async (req, ctx) => {
  if (process.env.NODE_ENV === "production") {
    throw new NotFoundError("Not found");
  }
  if (paymentsMode() !== "mock") {
    throw new BusinessRuleError("mock-complete is only available when PAYMENTS_MODE=mock");
  }

  const user = await requireRole("student", "parent", "center_admin");
  const { id } = await ctx.params;
  const { outcome } = await parseJson(req, bodySchema);

  const result = await mockCompletePaymentIntent(user, id, outcome);
  return ok(result);
});
