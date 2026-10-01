import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { buildStudentCard } from "@repo/server-core/services/students/student-card";

export const GET = withErrors(async (req) => {
  const session = await requireSession();
  const studentId = new URL(req.url).searchParams.get("studentId") ?? session.id;
  return ok({ card: await buildStudentCard(studentId, session) });
});
