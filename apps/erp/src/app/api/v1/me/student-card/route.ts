import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { buildStudentCard } from "@repo/server-core/services/students/student-card";

export const dynamic = "force-dynamic";

/**
 * The student's ID card — ON REQUEST ONLY.
 *
 * ── WHY THE CHECKLIST LEFT THIS ROUTE ──────────────────────────────────────
 *
 * It used to return `{ card, checklist }` together, so merely opening the card
 * screen built a card and signed a QR for every visit, whether or not the
 * student wanted to look at one. The checklist now lives at
 * `me/profile-checklist` and is what the screen opens with; this route is
 * called only when the student presses the button.
 *
 * That is not only about load. `buildStudentCard` REFUSES an incomplete
 * profile, and it is audited when a super admin is the caller — both are
 * reasons a card should be produced deliberately rather than as a side effect
 * of navigation.
 *
 * ONE route for both readers. `?studentId=` is the parent-acting-for-a-child
 * convention, and whether that is allowed is decided inside `buildStudentCard`
 * by the same `assertApprovedChild` gate every other parent path goes through.
 * A route that re-implemented it would be a second answer.
 */
export const GET = withErrors(async (req) => {
  const session = await requireSession();
  const studentId = new URL(req.url).searchParams.get("studentId") ?? session.id;
  return ok({ card: await buildStudentCard(studentId, session) });
});
