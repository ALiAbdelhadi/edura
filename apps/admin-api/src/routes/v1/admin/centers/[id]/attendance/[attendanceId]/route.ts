import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminEditAttendance } from "@repo/server-core/backoffice/admin/center-operations";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const patchSchema = z.object({ status: z.enum(["present", "absent", "excused"]) }).strict();

export const PATCH = withRole("super_admin", async (user, req, ctx) => {
  const { id, attendanceId } = await ctx.params;
  const { status } = await parseJson(req, patchSchema);
  return ok(await adminEditAttendance(user, id, attendanceId, status));
});
