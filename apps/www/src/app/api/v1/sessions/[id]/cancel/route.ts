import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { cancelSession } from "@/lib/services/session-actions/session-actions";

export const dynamic = "force-dynamic";

const cancelSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("teacher");
  const sessionId = ((await ctx?.params) as { id: string }).id;
  const { reason } = await parseJson(req, cancelSchema);

  const session = await cancelSession(sessionId, user.id, reason);
  return ok(session);
});
