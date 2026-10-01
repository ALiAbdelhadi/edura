import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  removeStudentFromCenter,
  restoreStudentToCenter,
} from "@repo/server-core/backoffice/admin/center-control";

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
