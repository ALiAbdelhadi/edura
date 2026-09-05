import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminListDeletionRequests } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  return ok(await adminListDeletionRequests(user, id, { status }));
});
