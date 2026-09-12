import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { teacherOverview } from "@/lib/services/admin/teacher-oversight";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await teacherOverview(id));
});
