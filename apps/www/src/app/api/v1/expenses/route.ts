import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { centerStaff, ACCOUNTANT } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { MAX_MONEY_PIASTERS } from "@/lib/validation/common";
import { EXPENSE_CATEGORIES, createExpense, listExpenses } from "@/lib/services/expenses/expenses";

export const dynamic = "force-dynamic";

// Reading expenses is a financial view (owner + center_accountant). RECORDING
// an expense (POST below) stays OWNER-ONLY — center_accountant is read-only and
// receptionists/managers are out of financial data-entry scope.
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
