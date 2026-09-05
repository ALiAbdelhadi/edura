import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  removeStudentFromCenter,
  restoreStudentToCenter,
} from "@/lib/services/admin/center-control";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    action: z.enum(["remove", "restore"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, studentId } = await ctx.params;
  const { action, reason } = await parseJson(req, schema);
  return ok(
    action === "remove"
      ? await removeStudentFromCenter(id, studentId, reason, user)
      : await restoreStudentToCenter(id, studentId, reason, user),
  );
});
