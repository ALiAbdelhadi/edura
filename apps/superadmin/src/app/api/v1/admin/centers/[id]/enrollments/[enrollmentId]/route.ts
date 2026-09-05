import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminUnenrollStudent } from "@/lib/services/admin/center-academic";

export const dynamic = "force-dynamic";

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id, enrollmentId } = await ctx.params;
  return ok(await adminUnenrollStudent(user, id, enrollmentId));
});
