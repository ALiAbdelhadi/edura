import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { cancelSession } from "@/lib/services/session-actions/session-actions";

export const dynamic = "force-dynamic";

const cancelSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

export const POST = delegatedWithCenter(async (req, ctx, { acting: user }) => {
  const sessionId = ((await ctx?.params) as { id: string }).id;
  const { reason } = await parseJson(req, cancelSchema);

  const session = await cancelSession(sessionId, user.id, reason);
  return ok(session);
});
