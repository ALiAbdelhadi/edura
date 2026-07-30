import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminSuggestSessions } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const studentId = new URL(req.url).searchParams.get("studentId") ?? "";
  return ok(await adminSuggestSessions(user, id, studentId));
});
