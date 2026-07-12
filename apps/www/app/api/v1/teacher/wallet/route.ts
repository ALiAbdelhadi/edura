import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { getTeacherWallet } from "@/lib/services/finance/teacherWallet";

export const dynamic = "force-dynamic";
// PRD §4.5 GET /teacher/wallet
export const GET = withErrors(async () => {
  const user = await requireRole("teacher");
  return ok(await getTeacherWallet(user));
});
