// REST-side chat service. All authorization + persistence rules live in the
// shared domain layer (@repo/database/chat — matrix + relationship gates),
// which the standalone realtime server uses too. This module adapts it to
// HTTP: session actors, AppError mapping, and the realtime/notify bridges.
import * as chat from "@repo/database/chat";
import { scopedDb, type TenantTx } from "@/lib/db/scope";
import { notify } from "@/lib/services/notifications/notify";
import {
  AppError,
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import { bridgeMessage, bridgeRead } from "./realtime-bridge";

function toAppError(err: unknown): unknown {
  if (!(err instanceof chat.ChatError)) return err;
  switch (err.code) {
    case "recipient_not_found":
    case "conversation_not_found":
      return new NotFoundError(err.message);
    case "policy_denied":
    case "no_relationship":
    case "not_participant":
      return new ForbiddenError(err.message);
    case "invalid_body":
      return new BusinessRuleError(err.message);
    default:
      return new AppError(500, "internal", err.message);
  }
}

async function run<T>(
  user: SessionUser,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  try {
    return await scopedDb(user, fn);
  } catch (err) {
    throw toAppError(err);
  }
}

function actor(user: SessionUser): chat.ChatActor {
  return { id: user.id, role: user.role, centerId: user.centerId ?? null };
}

// ---------------------------------------------------------------------------

export function listConversations(
  user: SessionUser,
  opts: { before?: Date; limit?: number },
) {
  return run(user, (tx) => chat.listConversations(tx, user.id, opts));
}

export function createConversation(user: SessionUser, recipientId: string) {
  return run(user, async (tx) => {
    const { conversation } = await chat.getOrCreateConversation(
      tx,
      actor(user),
      recipientId,
    );
    // Return the list-shaped view so the client can insert it directly.
    return chat.getConversationView(tx, user.id, conversation.id);
  });
}

export function getConversationThread(
  user: SessionUser,
  conversationId: string,
  opts: { beforeSeq?: number; limit?: number },
) {
  return run(user, async (tx) => {
    const conversation = await chat.getConversationView(tx, user.id, conversationId);
    const { messages, hasMore } = await chat.listMessages(
      tx,
      user.id,
      conversationId,
      opts,
    );
    return { conversation, messages, hasMore };
  });
}

export function listContacts(
  user: SessionUser,
  opts: { search?: string; limit?: number },
) {
  return run(user, (tx) => chat.listContacts(tx, actor(user), opts));
}

export function getUnreadTotal(user: SessionUser) {
  return run(user, (tx) => chat.getTotalUnread(tx, user.id));
}

// ---------------------------------------------------------------------------

export async function sendMessage(
  user: SessionUser,
  input: {
    conversationId?: string;
    recipientId?: string;
    body: string;
    clientId?: string;
  },
) {
  const result = await run(user, (tx) => chat.appendMessage(tx, actor(user), input));

  if (!result.duplicate) {
    // Live fanout via the realtime server; if the recipient has no live
    // socket (or the bridge is down), fall back to a push notification.
    const bridged = await bridgeMessage({
      message: result.message,
      recipientId: result.recipientId,
      sender: { id: user.id, name: user.name ?? "", role: user.role },
    });
    const recipientOnline = bridged?.recipientOnline ?? false;
    if (!recipientOnline) {
      await notify({
        recipients: [result.recipientId],
        type: "new_chat_message",
        title: user.name ? `New message from ${user.name}` : "New message",
        body:
          result.message.body.length > 120
            ? result.message.body.slice(0, 117) + "…"
            : result.message.body,
        data: {
          conversationId: result.message.conversationId,
          messageId: result.message.id,
          senderId: user.id,
        },
      });
    }
  }

  return { ...result.message, duplicate: result.duplicate };
}

export async function markConversationRead(
  user: SessionUser,
  conversationId: string,
) {
  const receipt = await run(user, (tx) =>
    chat.markConversationRead(tx, user.id, conversationId),
  );
  await bridgeRead({
    conversationId: receipt.conversationId,
    readerId: receipt.readerId,
    otherUserId: receipt.otherUserId,
    readAt: receipt.readAt.toISOString(),
  });
  return {
    conversationId: receipt.conversationId,
    readAt: receipt.readAt,
    updatedCount: receipt.updatedCount,
  };
}
