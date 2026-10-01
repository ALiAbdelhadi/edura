import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminDeleteExpense, adminUpdateExpense } from "@repo/server-core/backoffice/admin/center-money";
import { parseJson } from "@repo/server-core/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { z } from "zod";

const patchSchema = z
  .object({
    amount: moneySchema.positive().optional(),
    category: z
      .enum(["rent", "salaries", "utilities", "supplies", "marketing", "other"])
      .optional(),
    description: z.string().trim().max(500).optional(),
    expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export const PATCH = withRole("super_admin", async (user, req, ctx) => {
  const { id, expenseId } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await adminUpdateExpense(user, id, expenseId, body));
});

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id, expenseId } = await ctx.params;
  return ok(await adminDeleteExpense(user, id, expenseId));
});
