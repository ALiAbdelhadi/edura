import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listProposals } from "@repo/server-core/backoffice/admin/teacher-agreements-admin";

export const GET = withRole("super_admin", async (_user, req) => {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return ok(await listProposals(status));
});
