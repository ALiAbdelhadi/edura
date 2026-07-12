import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { editAttendance } from "@/lib/services/attendance/attendance";

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
