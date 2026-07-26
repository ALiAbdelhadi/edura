import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { adminListExpenses, adminCreateExpense } from "@/lib/services/admin/center-money";

// The center's own bookkeeping — NOT the append-only ledger.
export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    amount: moneySchema.positive(),
    category: z.enum(["rent", "salaries", "utilities", "supplies", "marketing", "other"]),
    description: z.string().trim().max(500).optional(),
    expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const GET = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await adminListExpenses(user, id, q));
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, createSchema);
  return ok(await adminCreateExpense(user, id, body), { status: 201 });
});
