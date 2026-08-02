import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { centerStaff, MANAGER, requireCenterActor } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  getExternalTeacher,
  removeExternalTeacher,
  updateExternalTeacher,
} from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ teacherId: string }> };

export const GET = centerStaff(
  async (_req, ctx, { acting }) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    return ok(await getExternalTeacher(acting, teacherId));
  },
  { allow: MANAGER },
);

const patchSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6).max(20).nullable(),
    email: z.email().nullable(),
    bio: z.string().trim().max(2000).nullable(),
    subjects: z.array(z.string().trim().min(1).max(80)).max(20),
    qualifications: z.string().trim().max(500).nullable(),
    lessonPrice: z.number().int().min(0).nullable(),
    centerShare: z.number().int().min(0).nullable(),
  })
  .partial();

export const PATCH = withErrors(async (req, ctx) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const { teacherId } = (await (ctx as Ctx).params);
  const data = await parseJson(req, patchSchema);
  return ok(await updateExternalTeacher(actor, teacherId, data));
});

const removeSchema = z.object({ reason: z.string().trim().min(3).max(500) });

/**
 * SOFT removal, and there is no hard-delete route here at all — not a flag that
 * defaults to soft, an absent code path. A teacher who taught one settled
 * lesson is referenced by the immutable ledger forever; deleting their row
 * would leave money pointing at nothing. `restore` brings them back to exactly
 * the same records.
 */
export const DELETE = withErrors(async (req, ctx) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const { teacherId } = (await (ctx as Ctx).params);
  const { reason } = await parseJson(req, removeSchema);
  return ok(await removeExternalTeacher(actor, teacherId, reason));
});
