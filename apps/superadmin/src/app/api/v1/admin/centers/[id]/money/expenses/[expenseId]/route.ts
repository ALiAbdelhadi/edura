import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { adminUpdateExpense, adminDeleteExpense } from "@/lib/services/admin/center-money";

export const dynamic = "force-dynamic";

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

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, expenseId } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await adminUpdateExpense(user, id, expenseId, body));
});

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, expenseId } = await ctx.params;
  return ok(await adminDeleteExpense(user, id, expenseId));
});
