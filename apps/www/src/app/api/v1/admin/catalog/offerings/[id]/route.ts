import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { updateOffering, deleteOffering } from "@/lib/services/catalog/catalog-admin";

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
