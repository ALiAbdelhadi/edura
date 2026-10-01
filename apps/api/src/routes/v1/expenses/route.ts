import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { centerStaff, ACCOUNTANT } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { MAX_MONEY_PIASTERS } from "@repo/server-core/validation/common";
import { EXPENSE_CATEGORIES, createExpense, listExpenses } from "@repo/server-core/services/expenses/expenses";

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const url = new URL(req.url);
    const filters = {
      category: url.searchParams.get("category") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    };
    const expenses = await listExpenses(filters, user);
    return ok(expenses);
  },
  { allow: ACCOUNTANT },
);

const createSchema = z.object({
  amount: z.number().int().positive().max(MAX_MONEY_PIASTERS),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().optional(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const data = await parseJson(req, createSchema);
  const expense = await createExpense(data, user);
  return ok(expense, { status: 201 });
});
