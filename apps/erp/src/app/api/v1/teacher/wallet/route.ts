import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getTeacherWallet } from "@/lib/services/finance/teacher-wallet";

export const dynamic = "force-dynamic";
export const GET = withErrors(async () => {
  const user = await requireRole("teacher");
  return ok(await getTeacherWallet(user));
});
