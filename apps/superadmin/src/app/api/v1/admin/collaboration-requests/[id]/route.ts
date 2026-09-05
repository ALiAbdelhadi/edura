import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getCollaborationRequest } from "@/lib/services/collaboration/collaboration-admin";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await getCollaborationRequest(id));
});
