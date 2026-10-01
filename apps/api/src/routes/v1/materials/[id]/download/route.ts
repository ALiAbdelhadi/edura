import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { toActingUser } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { getMaterialDownloadUrl } from "@repo/server-core/services/materials/materials";

export const GET = withErrors(async (_req, ctx) => {
  const user = await toActingUser(await requireSession());

  const materialId = ((await ctx?.params) as { id: string }).id;
  const result = await getMaterialDownloadUrl(materialId, user);
  return ok(result);
});
