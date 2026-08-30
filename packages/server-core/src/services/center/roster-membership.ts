import type { TenantTx } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";

/**
 * The one definition of "this centre holds this student".
 *
 * `leftAt: null` is the load-bearing half. A removal only stamps `leftAt`, so a
 * membership query without it answers "did this centre ever hold them", which is a
 * different and much wider question — it is how a centre keeps reading a child it no
 * longer teaches. Every caller that gates disclosure on roster membership must use
 * this, not its own copy.
 */
export async function isOnCenterRoster(
  tx: TenantTx,
  centerId: string,
  studentId: string,
): Promise<boolean> {
  const row = await tx.centerStudentRoster.findFirst({
    where: { centerId, studentId, leftAt: null },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Refuses with the same error as a student who does not exist. A caller must not be
 * able to tell "no such student" from "a student another centre holds".
 */
export async function assertOnCenterRoster(
  tx: TenantTx,
  centerId: string,
  studentId: string,
): Promise<void> {
  if (!(await isOnCenterRoster(tx, centerId, studentId))) {
    throw new NotFoundError("Student not found");
  }
}
