import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { centerStaff, RECEPTION, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  getRosterStudent,
  updateRosterStudent,
  removeRosterStudent,
} from "@repo/server-core/services/center/roster";

export const dynamic = "force-dynamic";

// GET (view) = receptionist+; PATCH (edit incl. blacklist toggle) = manager only
// — blacklisting is a manager capability, so it must not leak to a receptionist.
// DELETE (remove from roster) stays owner-only by omission.
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
