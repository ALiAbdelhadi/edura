import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { sendTempStudentInvite } from "@/lib/services/temp-students/temp-students";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("teacher", "center_admin");
  const { id } = await ctx.params;
  return ok(await sendTempStudentInvite(id, user));
});
