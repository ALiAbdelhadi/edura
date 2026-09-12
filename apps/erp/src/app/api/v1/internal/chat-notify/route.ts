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

// SECURITY_AUDIT.md (2026-09-11) RT-02: the realtime host names only the
// message; recipient, sender and body are read from the row it points at, so
// a compromised bridge cannot push arbitrary text to arbitrary users.
const schema = z.object({
  conversationId: z.uuid(),
  messageId: z.uuid(),
});

export const POST = withErrors(async (req) => {
  const secret = requireDedicatedSecret("INTERNAL_API_SECRET");
  if (!secretEquals(req.headers.get("x-internal-secret"), secret)) {
    throw new ForbiddenError("Invalid internal secret");
  }

  const data = await parseJson(req, schema);

  const message = await platformDb((tx) =>
    tx.conversationMessage.findUnique({
      where: { id: data.messageId, conversationId: data.conversationId },
      select: {
        id: true,
        senderId: true,
        body: true,
        conversation: { select: { userAId: true, userBId: true } },
      },
    }),
  );
  if (!message) return ok({ notified: false });
  const recipientId =
    message.senderId === message.conversation.userAId
      ? message.conversation.userBId
      : message.conversation.userAId;
  const sender = await platformDb((tx) =>
    tx.user.findUnique({ where: { id: message.senderId }, select: { name: true } }),
  );

  await notify({
    recipients: [recipientId],
    type: "new_chat_message",
    title: sender?.name ? `New message from ${sender.name}` : "New message",
    body: message.body.length > 120 ? message.body.slice(0, 117) + "…" : message.body,
    data: {
      conversationId: data.conversationId,
      messageId: data.messageId,
      senderId: message.senderId,
    },
  });
  return ok({ notified: true });
});
