import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listSubjectRequests } from "@/lib/services/catalog/catalog-admin";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const status = new URL(req.url).searchParams.get("status");
  const valid = status === "pending" || status === "approved" || status === "rejected" ? status : undefined;
  return ok(await listSubjectRequests(valid));
});
