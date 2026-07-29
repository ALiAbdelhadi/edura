import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { editAttendance } from "@/lib/services/attendance/attendance";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

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
