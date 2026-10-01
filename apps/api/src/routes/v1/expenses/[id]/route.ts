import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { MAX_MONEY_PIASTERS } from "@repo/server-core/validation/common";
import { EXPENSE_CATEGORIES, updateExpense, deleteExpense } from "@repo/server-core/services/expenses/expenses";

const patchSchema = z.object({
  amount: z.number().int().positive().max(MAX_MONEY_PIASTERS).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  description: z.string().optional(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const expenseId = ((await ctx?.params) as { id: string }).id;
  const data = await parseJson(req, patchSchema);
  const expense = await updateExpense(expenseId, data, user);
  return ok(expense);
});

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const expenseId = ((await ctx?.params) as { id: string }).id;
  const result = await deleteExpense(expenseId, user);
  return ok(result);
});
