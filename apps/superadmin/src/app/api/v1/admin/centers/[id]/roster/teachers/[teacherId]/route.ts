import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminRemoveTeacher } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id, teacherId } = await ctx.params;
  return ok(await adminRemoveTeacher(user, id, teacherId));
});
