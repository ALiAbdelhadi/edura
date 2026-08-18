import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { fileReport } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

const reportSchema = z
  .object({
    reportedUserId: z.uuid().optional(),
    conversationId: z.uuid().optional(),
    groupId: z.uuid().optional(),
    messageId: z.uuid().optional(),
    category: z.enum([
      "harassment",
      "spam",
      "inappropriate",
      "safety_concern",
      "other",
    ]),
    details: z.string().max(2000).optional(),
  })
  .refine((d) => d.conversationId || d.groupId || d.reportedUserId, {
    message: "conversationId, groupId or reportedUserId is required",
  });

// The reporter must be a participant in whatever they report — the service
// verifies that, so this cannot be used as a read oracle on other people's
// threads. Reports involving a minor are flagged and sort to the top of the
// super-admin queue.
export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const data = await parseJson(req, reportSchema);
  return ok(await fileReport(user, data), { status: 201 });
});
