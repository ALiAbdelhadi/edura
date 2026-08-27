import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { listDeletionQueue } from "@repo/server-core/services/data-rights/account-deletion";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("super_admin");
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listDeletionQueue(user, q));
});
