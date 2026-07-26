import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { unenrollStudent } from "@repo/server-core/services/center/enrollments";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { id } = await ctx.params;
  await unenrollStudent(user, id);
  return ok({ unenrolled: true });
});
