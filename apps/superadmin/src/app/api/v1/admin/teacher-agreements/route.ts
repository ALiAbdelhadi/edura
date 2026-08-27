import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listProposals } from "@/lib/services/admin/teacher-agreements-admin";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return ok(await listProposals(status));
});
