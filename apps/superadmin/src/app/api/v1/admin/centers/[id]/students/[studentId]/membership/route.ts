import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  removeStudentFromCenter,
  restoreStudentToCenter,
} from "@/lib/services/admin/center-control";

// Control op #4 — the ONLY oversight action that removes enrollments, and the
// reason it is a separate, explicitly-named endpoint rather than a flag on the
// status op. Removal goes through the H-04 cascade journal, so `restore`
// replays exactly the enrollments this action removed.
export const dynamic = "force-dynamic";

const schema = z
  .object({
    action: z.enum(["remove", "restore"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, studentId } = await ctx.params;
  const { action, reason } = await parseJson(req, schema);
  return ok(
    action === "remove"
      ? await removeStudentFromCenter(id, studentId, reason, user)
      : await restoreStudentToCenter(id, studentId, reason, user),
  );
});
