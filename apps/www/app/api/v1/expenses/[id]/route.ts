import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { MAX_MONEY_PIASTERS } from "@/lib/validation/common";
import { EXPENSE_CATEGORIES, updateExpense, deleteExpense } from "@/lib/services/expenses/expenses";

export const dynamic = "force-dynamic";

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
