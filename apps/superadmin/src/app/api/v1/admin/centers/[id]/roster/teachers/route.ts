import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminListTeachers } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return ok(await adminListTeachers(user, id, { status }));
});
