import { secretEquals } from "@repo/server-core/auth/secret-compare";
import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { ForbiddenError } from "@/lib/errors/classes";
import { parseJson } from "@/lib/validation/zod";
import { requireDedicatedSecret } from "@/lib/config/secrets";
import { notify } from "@/lib/services/notifications/notify";
import { platformDb } from "@/lib/db/scope";

export const dynamic = "force-dynamic";

const schema = z.object({
  recipientId: z.uuid(),
  senderName: z.string().max(200),
  conversationId: z.uuid(),
  messageId: z.uuid(),
  body: z.string().max(4000),
});

export const POST = withErrors(async (req) => {
  const secret = requireDedicatedSecret("INTERNAL_API_SECRET");
  if (!secretEquals(req.headers.get("x-internal-secret"), secret)) {
    throw new ForbiddenError("Invalid internal secret");
  }

  const data = await parseJson(req, schema);

  const message = await platformDb((tx) =>
    tx.conversationMessage.findUnique({
      where: { id: data.messageId },
      select: { id: true, senderId: true },
    }),
  );
  if (!message) return ok({ notified: false });

  await notify({
    recipients: [data.recipientId],
    type: "new_chat_message",
    title: data.senderName
      ? `New message from ${data.senderName}`
      : "New message",
    body: data.body.length > 120 ? data.body.slice(0, 117) + "…" : data.body,
    data: {
      conversationId: data.conversationId,
      messageId: data.messageId,
      senderId: message.senderId,
    },
  });
  return ok({ notified: true });
});
