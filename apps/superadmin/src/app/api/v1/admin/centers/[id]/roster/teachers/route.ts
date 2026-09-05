import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminListTeachers } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return ok(await adminListTeachers(user, id, { status }));
});
