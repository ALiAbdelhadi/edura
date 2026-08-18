import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { ok } from "@/lib/http/envelope";
import { getMaterialDownloadUrl } from "@/lib/services/materials/materials";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  // `toActingUser` — the same resolution the sibling list route (GET
  // /api/v1/materials) already used, and the one this route was missing: an
  // assistant acts as the teacher they serve, so the teacher branch in
  // getMaterialDownloadUrl applies to them. Without it an assistant arrived as
  // themselves and fell past every branch.
  const user = await toActingUser(await requireSession());

  const materialId = ((await ctx?.params) as { id: string }).id;
  const result = await getMaterialDownloadUrl(materialId, user);
  return ok(result);
});
