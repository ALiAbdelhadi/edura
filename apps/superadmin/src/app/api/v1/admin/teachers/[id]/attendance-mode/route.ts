import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { setTeacherAttendanceMode } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

const schema = z.object({ mode: z.enum(["counter_only", "counter_and_door"]) });

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { mode } = await parseJson(req, schema);
  return ok(await setTeacherAttendanceMode(id, mode, user.id));
});
