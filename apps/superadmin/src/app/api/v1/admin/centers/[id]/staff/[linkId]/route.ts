import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminUpdateStaff, adminRemoveStaff } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    role: z.enum(["receptionist", "manager", "center_accountant"]).optional(),
    title: z.string().trim().max(120).nullish(),
    active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "No fields to update" });

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, linkId } = await ctx.params;
  const data = await parseJson(req, patchSchema);
  return ok(await adminUpdateStaff(user, id, linkId, data));
});

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, linkId } = await ctx.params;
  return ok(await adminRemoveStaff(user, id, linkId));
});
