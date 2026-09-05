import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listSubjectRequests } from "@/lib/services/catalog/catalog-admin";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const status = new URL(req.url).searchParams.get("status");
  const valid = status === "pending" || status === "approved" || status === "rejected" ? status : undefined;
  return ok(await listSubjectRequests(valid));
});
