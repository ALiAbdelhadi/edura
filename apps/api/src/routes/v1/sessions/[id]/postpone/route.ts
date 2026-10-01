import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { isNotPastDate } from "@repo/server-core/validation/common";
import { postponeSession } from "@repo/server-core/services/session-actions/session-actions";

const postponeSchema = z.object({
  newDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "newDate must be YYYY-MM-DD")
    .refine(isNotPastDate, "newDate cannot be in the past"),
  newStartTime: z.string().regex(/^\d{2}:\d{2}$/, "newStartTime must be HH:mm"),
  newEndTime: z.string().regex(/^\d{2}:\d{2}$/, "newEndTime must be HH:mm"),
  reason: z.string().min(1, "Reason is required"),
});

export const POST = delegatedWithCenter(async (req, ctx, { acting: user }) => {
  const sessionId = ((await ctx?.params) as { id: string }).id;
  const { newDate, newStartTime, newEndTime, reason } = await parseJson(req, postponeSchema);

  const session = await postponeSession(sessionId, user.id, newDate, newStartTime, newEndTime, reason);
  return ok(session);
});
