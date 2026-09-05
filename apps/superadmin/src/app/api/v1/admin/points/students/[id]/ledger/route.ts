import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getStudentLedger } from "@/lib/services/points/points-admin";

export const dynamic = "force-dynamic";


export const GET = withRole("super_admin", async (_user, req, ctx) => {
  const { id } = await ctx.params;
  const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;
  return ok(await getStudentLedger(id, { limit }));
});
