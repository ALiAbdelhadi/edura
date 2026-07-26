import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminEditAttendance } from "@/lib/services/admin/center-operations";

// Allowed even after the session settled — but the divergence from the frozen
// present_count is measured into the audit row, and the settlement is NOT
// recomputed (that would be a retroactive re-rate).
export const dynamic = "force-dynamic";

const patchSchema = z.object({ status: z.enum(["present", "absent", "excused"]) }).strict();

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, attendanceId } = await ctx.params;
  const { status } = await parseJson(req, patchSchema);
  return ok(await adminEditAttendance(user, id, attendanceId, status));
});
