import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { deleteOffering, updateOffering } from "@/lib/services/catalog/catalog-admin";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ isActive: z.boolean() });

export const PATCH = withRole("super_admin", async (actor, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await updateOffering(id, body, actor));
});

export const DELETE = withRole("super_admin", async (actor, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await deleteOffering(id, actor));
});
