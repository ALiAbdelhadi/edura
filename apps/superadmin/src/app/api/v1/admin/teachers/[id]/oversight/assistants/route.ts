import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { teacherAssistants } from "@/lib/services/admin/teacher-oversight";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req, ctx) => {
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  return ok(await teacherAssistants(id, { includeRemoved: sp.get("includeRemoved") === "1" }));
});
