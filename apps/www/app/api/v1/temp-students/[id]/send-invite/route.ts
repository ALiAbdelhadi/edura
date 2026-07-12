import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { sendTempStudentInvite } from "@/lib/services/tempStudents/tempStudents";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PRD §4.8 — send the invite (code) to a temp student. teacher or center_admin.
export const POST = withErrors(async (_req, ctx) => {
  const user = await requireRole("teacher", "center_admin");
  const { id } = await ctx.params;
  return ok(await sendTempStudentInvite(id, user));
});
