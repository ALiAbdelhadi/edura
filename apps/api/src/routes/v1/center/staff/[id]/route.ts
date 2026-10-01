import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { removeStaff, updateStaff } from "@repo/server-core/services/center/staff";

const patchSchema = z
  .object({
    role: z.enum(["receptionist", "manager", "center_accountant"]).optional(),
    title: z.string().trim().max(120).nullish(),
    active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "No fields to update" });

export const PATCH = withErrors(
  async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireRole("center_admin");
    const { id } = await ctx.params;
    const data = await parseJson(req, patchSchema);
    return ok(await updateStaff(user, id ?? "", data));
  },
);

export const DELETE = withErrors(
  async (_req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const user = await requireRole("center_admin");
    const { id } = await ctx.params;
    return ok(await removeStaff(user, id ?? ""));
  },
);
