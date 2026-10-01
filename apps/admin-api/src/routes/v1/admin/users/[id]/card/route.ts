import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  buildStudentCard,
  reissueStudentCard,
  revokeStudentCard,
} from "@repo/server-core/services/students/student-card";
import { z } from "zod";

export const GET = withRole("super_admin", async (actor, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await buildStudentCard(id, actor));
});

const bodySchema = z.object({
  action: z.enum(["reissue", "revoke"]),
  reason: z.string().trim().min(3).max(500),
});

export const POST = withRole("super_admin", async (actor, req, ctx) => {
  const { id } = await ctx.params;
  const { action, reason } = await parseJson(req, bodySchema);
  return ok(
    action === "reissue"
      ? await reissueStudentCard(id, actor, reason)
      : await revokeStudentCard(id, actor, reason),
  );
});
