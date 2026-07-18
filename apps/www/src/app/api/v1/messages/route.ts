import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { sendMessage } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

// REST fallback send — the primary path is the realtime socket. Both funnel
// into the same domain logic (matrix + relationship authorization included).
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
