import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { getStaffMe } from "@repo/server-core/services/center/staff";

export const GET = withErrors(async () => {
  const user = await requireRole("center_staff");
  return ok(await getStaffMe(user));
});
