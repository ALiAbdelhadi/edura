import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listRosterTeachers } from "@repo/server-core/services/center/roster";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const status = new URL(req.url).searchParams.get("status");
  return ok(await listRosterTeachers(user, { status }));
});
