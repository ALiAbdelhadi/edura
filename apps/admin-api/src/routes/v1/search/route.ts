import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { backOfficeSearch } from "@repo/server-core/backoffice/admin/global-search";

export const GET = withRole(["super_admin", "accountant"], async (user, req) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return ok(await backOfficeSearch(user, { q }));
});
