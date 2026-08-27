import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import {
  ACCOUNTANT,
  centerStaff,
  MANAGER,
  requireCenterActor,
} from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listSettlements, settleWithTeacher } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ teacherId: string }> };

export const GET = centerStaff(
  async (_req, ctx, { acting }) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    return ok(await listSettlements(acting, teacherId));
  },
  { allow: [...MANAGER, ...ACCOUNTANT] },
);

const settleSchema = z.object({
  amount: z.number().int().positive(),
  from: z.string(),
  to: z.string(),
  paymentMethod: z.enum(["cash", "online_paymob", "wallet"]).optional(),
  note: z.string().trim().max(500).nullish(),
  snapshot: z
    .object({
      grossCollected: z.number().int().min(0),
      centerShareTotal: z.number().int().min(0),
      platformFeeTotal: z.number().int().min(0),
      teacherAccrued: z.number().int().min(0),
    })
    .optional(),
});

export const POST = withErrors(async (req, ctx) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const { teacherId } = await (ctx as Ctx).params;
  const body = await parseJson(req, settleSchema);

  return ok(
    await settleWithTeacher(actor, teacherId, {
      amount: body.amount,
      period: { from: new Date(body.from), to: new Date(body.to) },
      paymentMethod: body.paymentMethod ?? "cash",
      note: body.note ?? null,
      snapshot: body.snapshot,
    }),
    { status: 201 },
  );
});
