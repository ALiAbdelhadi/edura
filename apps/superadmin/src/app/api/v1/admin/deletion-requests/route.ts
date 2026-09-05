import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listDeletionQueue } from "@repo/server-core/services/data-rights/account-deletion";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (user, req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listDeletionQueue(user, q));
});
