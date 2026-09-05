import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getWalletForStudent } from "@/lib/services/wallet/wallet";

export const dynamic = "force-dynamic";

// A parent reads a named child's balance; a student reads their own and the
// parameter is refused if it points anywhere else. Read-only either way.
export const GET = withErrors(async (req) => {
  const user = await requireRole("student", "parent");
  const studentId = new URL(req.url).searchParams.get("studentId") ?? undefined;
  return ok(await getWalletForStudent(user, studentId));
});
