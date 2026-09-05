import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminCreateExpense, adminListExpenses } from "@/lib/services/admin/center-money";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    amount: moneySchema.positive(),
    category: z.enum(["rent", "salaries", "utilities", "supplies", "marketing", "other"]),
    description: z.string().trim().max(500).optional(),
    expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export const GET = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await adminListExpenses(user, id, q));
});

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, createSchema);
  return ok(await adminCreateExpense(user, id, body), { status: 201 });
});
