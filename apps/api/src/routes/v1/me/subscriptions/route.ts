import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listMySubscriptions } from "@repo/server-core/services/subscriptions/subscriptions";

export const GET = withErrors(async (req) => {
  const user = await requireRole("student", "parent");
  const studentId = new URL(req.url).searchParams.get("studentId") ?? undefined;
  return ok(await listMySubscriptions(user, { studentId }));
});
