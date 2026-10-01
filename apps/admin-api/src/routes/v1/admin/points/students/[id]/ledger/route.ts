import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getStudentLedger } from "@repo/server-core/backoffice/points/points-admin";

export const GET = withRole("super_admin", async (_user, req, ctx) => {
  const { id } = await ctx.params;
  const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;
  return ok(await getStudentLedger(id, { limit }));
});
