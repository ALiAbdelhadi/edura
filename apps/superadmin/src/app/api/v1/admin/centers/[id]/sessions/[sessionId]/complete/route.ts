import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminCompleteSession } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

export const POST = withRole("super_admin", async (user, _req, ctx) => {
  const { id, sessionId } = await ctx.params;
  return ok(await adminCompleteSession(user, id, sessionId));
});
