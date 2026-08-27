import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { backOfficeSearch } from "@/lib/services/admin/global-search";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("super_admin", "accountant");
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return ok(await backOfficeSearch(user, { q }));
});
