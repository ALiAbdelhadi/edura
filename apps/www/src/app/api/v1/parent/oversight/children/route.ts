import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listOversightChildren } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

// Which children this parent may oversee, and whether each is a MINOR.
// Default-minor: a child counts as an adult only with a VERIFIED date of birth
// showing 18+, so an unknown or unverified DOB keeps oversight active.
export const GET = withErrors(async () => {
  const user = await requireRole("parent");
  return ok(await listOversightChildren(user));
});
