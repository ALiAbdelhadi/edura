import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  adminGetStudent,
  adminUpdateStudent,
  adminRemoveStudent,
} from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

// The same editable set the center has. Money fields are absent because the
// kernel service has no path to them — not merely because this schema omits them.
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.email().optional(),
    phone: z.string().trim().max(20).optional(),
    operationalParentName: z.string().trim().max(120).optional(),
    operationalParentPhone: z.string().trim().max(20).optional(),
    blacklisted: z.boolean().optional(),
    blacklistReason: z.string().trim().max(500).optional(),
  })
  .strict();

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, studentId } = await ctx.params;
  return ok(await adminGetStudent(user, id, studentId));
});

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, studentId } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await adminUpdateStudent(user, id, studentId, body));
});

// Soft removal from the roster (leftAt). This does NOT withdraw enrollments —
// that is the separate H-04-journalled operation on …/students/[id]/membership.
export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, studentId } = await ctx.params;
  return ok(await adminRemoveStudent(user, id, studentId));
});
