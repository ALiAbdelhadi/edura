import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { sendMessage } from "@repo/server-core/services/messages/messages";

const createSchema = z
  .object({
    conversationId: z.uuid().optional(),
    recipientId: z.uuid().optional(),
    body: z.string().min(1, "Message cannot be empty").max(4000),
    clientId: z.string().max(64).optional(),
  })
  .refine((data) => data.conversationId || data.recipientId, {
    message: "Either conversationId or recipientId must be provided",
    path: ["conversationId"],
  });

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const data = await parseJson(req, createSchema);
  const message = await sendMessage(user, data);
  return ok(message, { status: 201 });
});
