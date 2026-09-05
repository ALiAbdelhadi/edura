import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { centerAttendance } from "@/lib/services/admin/center-oversight";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req, ctx) => {
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await centerAttendance(id, q));
});
