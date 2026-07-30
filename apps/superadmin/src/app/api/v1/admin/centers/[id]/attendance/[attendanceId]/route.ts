import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminEditAttendance } from "@/lib/services/admin/center-operations";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ status: z.enum(["present", "absent", "excused"]) }).strict();

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, attendanceId } = await ctx.params;
  const { status } = await parseJson(req, patchSchema);
  return ok(await adminEditAttendance(user, id, attendanceId, status));
});
