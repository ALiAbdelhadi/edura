import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { centerStaff, MANAGER, requireCenterActor } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  getExternalTeacher,
  removeExternalTeacher,
  updateExternalTeacher,
} from "@repo/server-core/services/external-teachers/index";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

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

const handlePatch = withErrors(async (req, ctx) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const { teacherId } = (await (ctx as Ctx).params);
  const data = await parseJson(req, patchSchema);
  return ok(await updateExternalTeacher(actor, teacherId, data));
});

const removeSchema = z.object({ reason: z.string().trim().min(3).max(500) });

const handleDelete = withErrors(async (req, ctx) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const { teacherId } = (await (ctx as Ctx).params);
  const { reason } = await parseJson(req, removeSchema);
  return ok(await removeExternalTeacher(actor, teacherId, reason));
});

export const PATCH = invalidatesPublicData(handlePatch);
export const DELETE = invalidatesPublicData(handleDelete);
