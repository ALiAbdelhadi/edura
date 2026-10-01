import { platformDb } from "../../db/scope";
import { notify } from "../notifications/notify";

export async function notifyChatMessage(input: {
  conversationId: string;
  messageId: string;
}): Promise<{ notified: boolean }> {
  const message = await platformDb((tx) =>
    tx.conversationMessage.findUnique({
      where: { id: input.messageId, conversationId: input.conversationId },
      select: {
        id: true,
        senderId: true,
        body: true,
        conversation: { select: { userAId: true, userBId: true } },
      },
    }),
  );
  if (!message) return { notified: false };
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
      conversationId: input.conversationId,
      messageId: input.messageId,
      senderId: message.senderId,
    },
  });
  return { notified: true };
}
