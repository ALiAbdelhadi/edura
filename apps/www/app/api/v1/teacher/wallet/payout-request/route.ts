import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { requestTeacherPayout } from "@/lib/services/finance/teacherWallet";

export const dynamic = "force-dynamic";
// PRD §4.5 POST /teacher/wallet/payout-request
export const POST = withErrors(async () => {
  const user = await requireRole("teacher");
  return ok(await requestTeacherPayout(user), { status: 201 });
});
