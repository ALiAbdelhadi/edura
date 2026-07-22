import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { getStaffMe } from "@/lib/services/center/staff";

export const dynamic = "force-dynamic";

// The staff member's own delegation view — drives the portal nav and is a
// live, revocation-aware guard. A deactivated staff account resolves to no
// active link -> 403, so the portal redirects to login on the next request.
export const GET = withErrors(async () => {
  const user = await requireRole("center_staff");
  return ok(await getStaffMe(user));
});
