import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { deleteOffering, updateOffering } from "@repo/server-core/services/catalog/catalog-admin";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

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
