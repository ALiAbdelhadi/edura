import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { removeStaff, updateStaff } from "@/lib/services/center/staff";

export const dynamic = "force-dynamic";

// Owner-only (HARD EXCLUSION #4). `[id]` is the CenterStaff link id.

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
