import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { requestTeacherPayout } from "@/lib/services/finance/teacher-wallet";

export const dynamic = "force-dynamic";
export const POST = withErrors(async () => {
  const user = await requireRole("teacher");
  return ok(await requestTeacherPayout(user), { status: 201 });
});
