import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { fileReport } from "@repo/server-core/services/messages/messages";

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

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const data = await parseJson(req, reportSchema);
  return ok(await fileReport(user, data), { status: 201 });
});
