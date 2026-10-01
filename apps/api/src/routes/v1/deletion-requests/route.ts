import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listDeletionRequests } from "@repo/server-core/services/center/deletion-requests";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const status = new URL(req.url).searchParams.get("status") || "pending";
  return ok(await listDeletionRequests(user, { status }));
});
