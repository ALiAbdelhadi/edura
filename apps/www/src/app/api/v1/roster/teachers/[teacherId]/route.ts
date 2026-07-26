import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { removeRosterTeacher } from "@repo/server-core/services/center/roster";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { teacherId } = await ctx.params;
  return ok(await removeRosterTeacher(user, teacherId as string));
});
