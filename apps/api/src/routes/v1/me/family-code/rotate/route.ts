import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { rotateFamilyCode } from "@repo/server-core/services/parent-links/parent-links";

export const POST = withErrors(async () => {
  const user = await requireRole("student");
  const data = await rotateFamilyCode(user);
  return ok(data);
});
