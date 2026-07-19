import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { acceptCollaborationRequest } from "@/lib/services/collaboration/collaboration";

export const dynamic = "force-dynamic";

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("teacher", "center_admin");
  const { id } = await ctx.params;
  return ok(await acceptCollaborationRequest(id, user));
});
