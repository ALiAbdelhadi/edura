import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { teacherStatement } from "@/lib/services/finance/finance-reports";

export const dynamic = "force-dynamic";
export const GET = withErrors(async (req, ctx) => {
  await requireRole("accountant", "super_admin");
  const { teacherId } = await ctx.params;
  const p = new URL(req.url).searchParams;
  return ok(await teacherStatement(teacherId, p.get("from") ?? undefined, p.get("to") ?? undefined));
});
