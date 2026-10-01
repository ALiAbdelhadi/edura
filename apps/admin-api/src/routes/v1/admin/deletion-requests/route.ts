import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listDeletionQueue } from "@repo/server-core/services/data-rights/account-deletion";

export const GET = withRole("super_admin", async (user, req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listDeletionQueue(user, q));
});
