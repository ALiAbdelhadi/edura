import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { delegatedWithCenter, toActingUser } from "@repo/server-core/authz/teacher-actor";
import { authorizeCenterActor } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  getSessionAttendance,
  bulkMarkAttendance,
} from "@repo/server-core/services/attendance/attendance";
import {
  assertSessionAttendanceReadable,
  resolveSessionCenterForMarking,
} from "@repo/server-core/services/attendance/session-scope";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrors(async (_req, ctx) => {
  // SECURITY_AUDIT.md M-01 — see sessions/[id]/route.ts. Staff are re-keyed to
  // their centre; every role not named in assertSessionAttendanceReadable is
  // refused rather than falling through to getSessionAttendance's full records
  // + coverage.
  const session0 = await requireSession();
  const user =
    session0.role === "center_staff"
      ? (
          await authorizeCenterActor(session0, {
            allow: ["receptionist", "manager", "center_accountant"],
          })
        ).acting
      : await toActingUser(session0);

  const sessionId = (await ctx.params).id;

  await assertSessionAttendanceReadable(user, sessionId);

  const result = await getSessionAttendance(
    sessionId,
    user.id,
    user.role,
    user.centerId,
  );
  return ok(result);
});

const attendanceEntrySchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["present", "absent", "excused"]),
});

const bulkMarkSchema = z.union([
  z.array(attendanceEntrySchema).min(1),
  z.object({ records: z.array(attendanceEntrySchema).min(1) }),
]);

export const PUT = delegatedWithCenter(async (req, ctx, { acting: user }) => {

  const sessionId = (await ctx.params).id;
  const parsed = await parseJson(req, bulkMarkSchema);
  const entries = Array.isArray(parsed) ? parsed : parsed.records;

  const centerId = await resolveSessionCenterForMarking(user, sessionId);

  const result = await bulkMarkAttendance(
    sessionId,
    entries,
    user.id,
    centerId,
  );
  return ok(result);
});
