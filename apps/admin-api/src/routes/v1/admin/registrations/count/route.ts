import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { countPendingRegistrations } from "@repo/server-core/backoffice/admin/platform";

export const GET = withRole("super_admin", async () => {
  return ok(await countPendingRegistrations());
});
