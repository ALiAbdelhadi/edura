import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminListEnrollmentRequests } from "@repo/server-core/backoffice/admin/center-academic";

export const GET = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return ok(await adminListEnrollmentRequests(user, id, { status }));
});
