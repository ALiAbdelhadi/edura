import { requireRole } from "@repo/server-core/authz/require-role";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { editAttendance } from "@repo/server-core/services/attendance/attendance";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["present", "absent", "excused"]),
});

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("center_admin");
  const attendanceId = ((await ctx?.params) as { id: string }).id;
  const { status } = await parseJson(req, patchSchema);

  const record = await editAttendance(attendanceId, status, user.id, user.centerId!);
  return ok(record);
});
