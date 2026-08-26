import type { TenantTx } from "../../db/scope";

// ---------------------------------------------------------------------------
// Phase 0 of the revenue-operations spec (docs/reports/
// revenue-operations-spec-audit.md): ONE predicate for "this lesson's register
// is closed", shared by every attendance writer.
//
// Before this existed the settled-lesson freeze had FIVE doors and only the
// bulk/edit pair even looked at the 7-day window: counterCheckin refused only
// `cancelled`, doorTransitionTx checked nothing at all, and the offline sync's
// raw branch checked enrollment only. Money moved at settlement while the
// facts it was computed from stayed writable — flipping a `counter_only`
// student to `present` AFTER distribution was the worst case, because that
// student was deliberately excluded from the money.
// ---------------------------------------------------------------------------

export type LessonCloseShape = {
  status: string;
  distributedAt: Date | null;
};

/**
 * Closed = cancelled, completed, or revenue-distributed. Completed counts even
 * when distribution skipped (teacher-direct, or nobody present): "إنهاء الحصة"
 * closes the register immediately — the repair door for a prematurely closed
 * register is `reopenAttendanceForSettlement`, which is audited, not a silent
 * write past the lock.
 */
export function lessonClosed(session: LessonCloseShape): boolean {
  return (
    session.status === "cancelled" ||
    session.status === "completed" ||
    session.distributedAt !== null
  );
}

/**
 * Serialize attendance writers against settlement on the session row.
 *
 * The race this closes: a check-in reads `distributedAt IS NULL`, settlement
 * reads the present set, both commit — a student now exists on a settled
 * lesson that never counted them, with no re-settlement and no reversal.
 * Settlement takes this lock right after loading the session; every writer
 * takes it before reading. Whoever is second blocks for the length of one
 * short transaction, then sees the other's committed truth. Lock order is
 * session-row-first everywhere, so there is no deadlock pair.
 *
 * Under a tenant-scoped tx RLS applies to raw SQL too, so a row the caller
 * cannot see simply does not lock — identical visibility to the findUnique
 * that follows.
 */
export async function lockSessionRow(tx: TenantTx, sessionId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
}
