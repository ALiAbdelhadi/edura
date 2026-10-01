import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listSubjectRequests } from "@repo/server-core/services/catalog/catalog-admin";

export const GET = withRole("super_admin", async (_user, req) => {
  const status = new URL(req.url).searchParams.get("status");
  const valid = status === "pending" || status === "approved" || status === "rejected" ? status : undefined;
  return ok(await listSubjectRequests(valid));
});
