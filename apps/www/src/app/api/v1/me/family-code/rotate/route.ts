import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { rotateFamilyCode } from "@/lib/services/parent-links/parent-links";

export const dynamic = "force-dynamic";

export const POST = withErrors(async () => {
  const user = await requireRole("student");
  const data = await rotateFamilyCode(user);
  return ok(data);
});
