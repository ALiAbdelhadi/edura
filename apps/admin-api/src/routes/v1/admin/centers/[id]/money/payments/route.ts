import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { moneySchema } from "@repo/server-core/validation/common";
import { adminListPayments, adminRecordPayment } from "@repo/server-core/backoffice/admin/center-money";

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
