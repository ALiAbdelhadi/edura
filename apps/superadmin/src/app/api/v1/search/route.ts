import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { backOfficeSearch } from "@/lib/services/admin/global-search";

export const dynamic = "force-dynamic";

export const GET = withRole(["super_admin", "accountant"], async (user, req) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return ok(await backOfficeSearch(user, { q }));
});
