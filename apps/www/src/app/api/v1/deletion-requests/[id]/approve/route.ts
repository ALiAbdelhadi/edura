import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { approveDeletionRequest } from "@repo/server-core/services/center/deletion-requests";

export const dynamic = "force-dynamic";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  return ok(await approveDeletionRequest(user, id as string));
});
