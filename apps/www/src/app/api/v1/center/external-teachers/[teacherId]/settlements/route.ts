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

/** Settlement history — a report, so the read-only finance tier may see it. */
export const GET = centerStaff(
  async (_req, ctx, { acting }) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    return ok(await listSettlements(acting, teacherId));
  },
  { allow: [...MANAGER, ...ACCOUNTANT] },
);

const settleSchema = z.object({
  /** Piasters. */
  amount: z.number().int().positive(),
  from: z.string(),
  to: z.string(),
  paymentMethod: z.enum(["cash", "online_paymob", "wallet"]).optional(),
  note: z.string().trim().max(500).nullish(),
  // What the operator was looking at when they decided. Frozen onto the record
  // so a later attendance edit cannot rewrite what was agreed and handed over.
  snapshot: z
    .object({
      grossCollected: z.number().int().min(0),
      centerShareTotal: z.number().int().min(0),
      platformFeeTotal: z.number().int().min(0),
      teacherAccrued: z.number().int().min(0),
    })
    .optional(),
});

/**
 * Record cash handed to the teacher.
 *
 * OWNER ONLY — this is money leaving the center, which is the same reasoning
 * that keeps the center wallet's payout request owner-only (a HARD EXCLUSION in
 * the center-staff capability map). A manager may read the statement all day;
 * only the owner settles against it.
 *
 * The debit is the same H2 conditional decrement every payout uses, in the same
 * transaction as the ledger row — so cash can never leave without an entry, and
 * two staff members settling at once cannot both win.
 */
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
