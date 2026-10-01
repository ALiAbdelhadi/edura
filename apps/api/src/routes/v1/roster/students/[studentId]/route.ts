import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { centerStaff, RECEPTION, MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  getRosterStudent,
  updateRosterStudent,
  removeRosterStudent,
} from "@repo/server-core/services/center/roster";

export const GET = centerStaff(
  async (_req, ctx, { acting }) => {
    const { studentId } = await ctx.params;
    return ok(await getRosterStudent(acting, studentId as string));
  },
  { allow: RECEPTION },
);

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  operationalParentName: z.string().optional(),
  operationalParentPhone: z.string().optional(),
  blacklisted: z.boolean().optional(),
  blacklistReason: z.string().optional(),
});

export const PATCH = centerStaff(
  async (req, ctx, { acting }) => {
    const { studentId } = await ctx.params;
    const body = await parseJson(req, patchSchema);
    return ok(await updateRosterStudent(acting, studentId as string, body));
  },
  { allow: MANAGER },
);

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { studentId } = await ctx.params;
  return ok(await removeRosterStudent(user, studentId as string));
});
