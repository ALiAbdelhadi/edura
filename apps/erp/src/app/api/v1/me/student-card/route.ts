import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { buildStudentCard } from "@repo/server-core/services/students/student-card";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const session = await requireSession();
  const studentId = new URL(req.url).searchParams.get("studentId") ?? session.id;
  return ok({ card: await buildStudentCard(studentId, session) });
});
