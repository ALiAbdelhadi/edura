import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { sendMessage } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  threadId: z.string().optional(),
  recipientId: z.string().optional(),
  body: z.string().min(1, "Message cannot be empty"),
}).refine(data => data.threadId || data.recipientId, {
  message: "Either threadId or recipientId must be provided",
  path: ["threadId"]
});

export const POST = withErrors(async (req) => {
  const user = await requireSession();

  const data = await parseJson(req, createSchema);
  const message = await sendMessage(data, user);
  
  return ok(message, { status: 201 });
});
