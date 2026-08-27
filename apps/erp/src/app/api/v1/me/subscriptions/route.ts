import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listMySubscriptions } from "@/lib/services/subscriptions/subscriptions";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("student", "parent");
  const studentId = new URL(req.url).searchParams.get("studentId") ?? undefined;
  return ok(await listMySubscriptions(user, { studentId }));
});
