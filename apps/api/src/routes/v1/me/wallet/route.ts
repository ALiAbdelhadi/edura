import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getWalletForStudent } from "@repo/server-core/services/wallet/wallet-facade";

// A parent reads a named child's balance; a student reads their own and the
// parameter is refused if it points anywhere else. Read-only either way.
export const GET = withErrors(async (req) => {
  const user = await requireRole("student", "parent");
  const studentId = new URL(req.url).searchParams.get("studentId") ?? undefined;
  return ok(await getWalletForStudent(user, studentId));
});
