import { withErrors } from "@repo/server-core/errors/http";
import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { sendTempStudentInvite } from "@repo/server-core/services/temp-students/temp-students";

type Ctx = { params: Promise<{ id: string }> };

export const POST = delegatedWithCenter(async (_req, ctx, { acting: user }) => {
  const { id } = await ctx.params;
  return ok(await sendTempStudentInvite(id, user));
});
