import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getTeacherWallet } from "@repo/server-core/services/finance/teacher-wallet";

export const GET = withErrors(async () => {
  const user = await requireRole("teacher");
  return ok(await getTeacherWallet(user));
});
