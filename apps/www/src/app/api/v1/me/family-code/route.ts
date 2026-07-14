import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getFamilyCode } from "@/lib/services/parent-links/parent-links";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("student");
  const data = await getFamilyCode(user);
  return ok(data);
});
