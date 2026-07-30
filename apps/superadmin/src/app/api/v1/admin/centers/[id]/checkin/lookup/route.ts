import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { adminLookupStudents } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

export const GET = withRateLimit(
  withErrors(async (req, ctx) => {
    const user = await requireRole("super_admin");
    const { id } = await ctx.params;
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return ok(await adminLookupStudents(user, id, q));
  }),
  30,
  30,
);
