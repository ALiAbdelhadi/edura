import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import { doorCheckin, doorSessionState } from "@repo/server-core/services/attendance/checkin";

const bodySchema = z
  .object({
    studentId: z.string().uuid().optional(),
    studentCode: z.string().trim().min(3).optional(),
    sessionId: z.string().uuid(),
  })
  .strict()
  .refine((b) => b.studentId || b.studentCode, {
    message: "studentId or studentCode is required",
  });

export const POST = withErrors(async (req) => {
  const user = await requireRole("assistant", "teacher");
  const body = await parseJson(req, bodySchema);
  return ok(await doorCheckin(body, user));
});

export const GET = withErrors(async (req) => {
  const user = await requireRole("assistant", "teacher");
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) throw new BusinessRuleError("sessionId is required");
  return ok(await doorSessionState(sessionId, user));
});
