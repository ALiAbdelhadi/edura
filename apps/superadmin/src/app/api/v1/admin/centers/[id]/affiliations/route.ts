import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getCenterAffiliations } from "@/lib/services/admin/rooms-split";

export const dynamic = "force-dynamic";

// The center's teacher arrangements + their flat no-room center share.
// super_admin ONLY — this share is money config neither side may propose.
export const GET = withErrors(async (_req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await getCenterAffiliations(id));
});
