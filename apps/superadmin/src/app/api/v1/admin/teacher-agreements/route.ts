import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listProposals } from "@/lib/services/admin/teacher-agreements-admin";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return ok(await listProposals(status));
});
