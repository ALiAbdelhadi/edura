import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listDeletionRequests } from "@repo/server-core/services/center/deletion-requests";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const status = new URL(req.url).searchParams.get("status") || "pending";
  return ok(await listDeletionRequests(user, { status }));
});
