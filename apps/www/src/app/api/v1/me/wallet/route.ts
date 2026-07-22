import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getWalletForStudent } from "@/lib/services/wallet/wallet";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("student");
  return ok(await getWalletForStudent(user));
});
