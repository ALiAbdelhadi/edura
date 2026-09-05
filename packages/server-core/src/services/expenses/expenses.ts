import type { SessionUser } from "../../auth/types";
import { scopedDb } from "../../db/scope";
import type { TenantTx } from "@repo/database";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";

export const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "supplies",
  "marketing",
  "maintenance",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export async function createExpense(
  data: {
    amount: number;
    category: string;
    description?: string;
    expenseDate: string;
  },
  user: SessionUser,
) {
  if (data.amount <= 0) throw new BusinessRuleError("Expense amount must be a positive integer");
  if (!Number.isInteger(data.amount)) throw new BusinessRuleError("Amount must be an integer (minor units)");
  if (!EXPENSE_CATEGORIES.includes(data.category as ExpenseCategory)) {
    throw new BusinessRuleError(`Invalid category. Must be one of: ${EXPENSE_CATEGORIES.join(", ")}`);
  }

  return scopedDb(user, (tx) => createExpenseTx(tx, data, user));
}

export function createExpenseTx(
  tx: TenantTx,
  data: { amount: number; category: string; description?: string; expenseDate: string },
  user: SessionUser,
) {
  return tx.expense.create({
    data: {
      centerId: user.centerId as string,
      amount: data.amount,
      category: data.category as ExpenseCategory,
      description: data.description ?? "",
      recordedBy: user.id,
      expenseDate: new Date(data.expenseDate),
    },
  });
}

export async function listExpenses(
  filters: { category?: string; from?: string; to?: string },
  user: SessionUser,
) {
  return scopedDb(user, (tx) => {
    const where: Record<string, unknown> = { centerId: user.centerId };

    if (filters.category) where.category = filters.category;
    if (filters.from || filters.to) {
      const dateFilter: Record<string, Date> = {};
      if (filters.from) dateFilter.gte = new Date(filters.from);
      if (filters.to) dateFilter.lte = new Date(filters.to);
      where.expenseDate = dateFilter;
    }

    return tx.expense.findMany({ where, orderBy: { expenseDate: "desc" } });
  });
}

export async function updateExpense(
  expenseId: string,
  data: Partial<{ amount: number; category: string; description: string; expenseDate: string }>,
  user: SessionUser,
) {
  return scopedDb(user, (tx) => updateExpenseTx(tx, expenseId, data, user));
}

export async function updateExpenseTx(
  tx: TenantTx,
  expenseId: string,
  data: Partial<{ amount: number; category: string; description: string; expenseDate: string }>,
  user: SessionUser,
) {
  return (async () => {
    const expense = await tx.expense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new NotFoundError("Expense not found");
    if (expense.centerId !== user.centerId) throw new ForbiddenError();

    const patch: Record<string, unknown> = {};
    if (data.amount !== undefined) {
      if (data.amount <= 0 || !Number.isInteger(data.amount))
        throw new BusinessRuleError("Amount must be a positive integer (minor units)");
      patch.amount = data.amount;
    }
    if (data.category !== undefined) patch.category = data.category as ExpenseCategory;
    if (data.description !== undefined) patch.description = data.description;
    if (data.expenseDate !== undefined) patch.expenseDate = new Date(data.expenseDate);

    return tx.expense.update({ where: { id: expenseId }, data: patch });
  })();
}

export async function deleteExpense(expenseId: string, user: SessionUser) {
  return scopedDb(user, (tx) => deleteExpenseTx(tx, expenseId, user));
}

export async function deleteExpenseTx(tx: TenantTx, expenseId: string, user: SessionUser) {
  const expense = await tx.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw new NotFoundError("Expense not found");
  if (expense.centerId !== user.centerId) throw new ForbiddenError();
  await tx.expense.delete({ where: { id: expenseId } });
  return { deleted: true };
}
