import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { adminListPayments, adminRecordPayment } from "@/lib/services/admin/center-money";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    studentId: z.uuid(),
    courseId: z.uuid().optional(),
    amount: moneySchema.positive(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const GET = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await adminListPayments(user, id, q));
});

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, createSchema);
  return ok(await adminRecordPayment(user, id, body), { status: 201 });
});
