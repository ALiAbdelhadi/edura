import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { listStudentPointsHistory } from "@/lib/services/points/points";

export const dynamic = "force-dynamic";

// Student self-service: points ledger history (PRD §4.6). internal_note hidden.
export const GET = withErrors(async (req) => {
  const user = await requireRole("student");
  const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;
  const history = await listStudentPointsHistory(user.id, { limit });
  return ok(history);
});
