import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { getStudentLedger } from "@/lib/services/points/pointsAdmin";

export const dynamic = "force-dynamic";


export const GET = withErrors(async (req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;
  return ok(await getStudentLedger(id, { limit }));
});
