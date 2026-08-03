import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import {
  buildProfileChecklist,
  buildStudentCard,
} from "@repo/server-core/services/students/student-card";

export const dynamic = "force-dynamic";

/**
 * The student's ID card, and the checklist that sits under it.
 *
 * ONE route for both readers. `?studentId=` is the same convention
 * `me/guardian-contact` already uses for a parent acting for a child, and the
 * decision about whether that is allowed is NOT made here — it is made inside
 * `buildStudentCard`, by the same `assertApprovedChild` gate every other parent
 * path goes through. A route that re-implemented it would be a second answer.
 */
export const GET = withErrors(async (req) => {
  const session = await requireSession();
  const studentId = new URL(req.url).searchParams.get("studentId") ?? session.id;

  const [card, checklist] = await Promise.all([
    buildStudentCard(studentId, session),
    buildProfileChecklist(studentId, session),
  ]);

  return ok({ card, checklist });
});
