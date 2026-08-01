import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { listDeletionQueue } from "@repo/server-core/services/data-rights/account-deletion";

export const dynamic = "force-dynamic";

/**
 * The platform-wide deletion queue.
 *
 * Distinct from `/admin/centers/[id]/deletion-requests`, which is the CENTER's
 * queue scoped to one tenant. Same table, two desks: a center reviews requests
 * about its own members; the platform reviews the ones a person raised about
 * themselves, which carry no center.
 */
export const GET = withErrors(async (req) => {
  const user = await requireRole("super_admin");
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listDeletionQueue(user, q));
});
