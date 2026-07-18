import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { refundLessonForStudent } from "@/lib/services/finance/refunds";
import { refundsReport } from "@/lib/services/finance/finance-reports";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  studentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("accountant", "super_admin");
  const { sessionId, studentId, reason } = await parseJson(req, bodySchema);
  return ok(await refundLessonForStudent(sessionId, studentId, reason, user));
});

export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
  const url = new URL(req.url);
  return ok(await refundsReport(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined));
});
