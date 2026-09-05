import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { setTeacherAttendanceMode } from "@/lib/services/admin/platform";

export const dynamic = "force-dynamic";

const schema = z.object({ mode: z.enum(["counter_only", "counter_and_door"]) });

export const PATCH = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { mode } = await parseJson(req, schema);
  return ok(await setTeacherAttendanceMode(id, mode, user.id));
});
