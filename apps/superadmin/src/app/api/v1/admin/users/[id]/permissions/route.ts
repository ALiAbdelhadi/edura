import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { getUserPermissions, updateUserStatus } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await getUserPermissions(id));
});

const patchSchema = z.object({ status: z.enum(["active", "suspended"]) });

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { status } = await parseJson(req, patchSchema);
  return ok(await updateUserStatus(id, status, user.id));
});
