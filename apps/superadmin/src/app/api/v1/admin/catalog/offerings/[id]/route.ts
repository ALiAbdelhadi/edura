import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { deleteOffering, updateOffering } from "@/lib/services/catalog/catalog-admin";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ isActive: z.boolean() });

export const PATCH = withErrors(async (req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await updateOffering(id, body));
});

export const DELETE = withErrors(async (_req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await deleteOffering(id));
});
