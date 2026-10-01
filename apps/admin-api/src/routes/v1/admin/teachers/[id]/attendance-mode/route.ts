import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { setTeacherAttendanceMode } from "@repo/server-core/backoffice/admin/platform";

const schema = z.object({ mode: z.enum(["counter_only", "counter_and_door"]) });

export const PATCH = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { mode } = await parseJson(req, schema);
  return ok(await setTeacherAttendanceMode(id, mode, user.id));
});
