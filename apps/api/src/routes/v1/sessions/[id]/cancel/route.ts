import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { cancelSession } from "@repo/server-core/services/session-actions/session-actions";

const cancelSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

export const POST = delegatedWithCenter(async (req, ctx, { acting: user }) => {
  const sessionId = ((await ctx?.params) as { id: string }).id;
  const { reason } = await parseJson(req, cancelSchema);

  const session = await cancelSession(sessionId, user.id, reason);
  return ok(session);
});
