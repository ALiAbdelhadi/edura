import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { getMaterialDownloadUrl } from "@/lib/services/materials/materials";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireSession();

  const materialId = ((await ctx?.params) as { id: string }).id;
  const result = await getMaterialDownloadUrl(materialId, user);
  return ok(result);
});
