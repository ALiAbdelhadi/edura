import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { teacherCenters } from "@repo/server-core/backoffice/admin/teacher-oversight";

export const GET = withRole("super_admin", async (_user, req, ctx) => {
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  return ok(await teacherCenters(id, { includeRemoved: sp.get("includeRemoved") === "1" }));
});
