import type { TenantTx } from "../client";
import type {
  Conversation,
  ConversationMessage,
  Role,
} from "../generated/client/index";
import {
  assertCanReach,
  assertNotBlocked,
  ChatError,
  consume,
  RATE_LIMITS,
  type ChatActor,
  type ChatLimiter,
} from "./chat-scope";

export {
  ChatError,
  assertCanReach,
  assertNotBlocked,
  canReach,
  listContacts,
  reachableRoles,
  resolveActor,
  RATE_LIMITS,
} from "./chat-scope";
export type {
  ChatActor,
  ChatErrorCode,
  ChatLimiter,
  ContactGroup,
  ContactView,
  ReachDecision,
  UserLite,
} from "./chat-scope";
export type { InitiationMode } from "./chat-policy";

export const MAX_MESSAGE_LENGTH = 4000;
export const PREVIEW_LENGTH = 140;

export const REMOVED_BODY = "";

export type MessageView = {
  id: string;
  conversationId: string;
  senderId: string;
  seq: number;
  body: string;
  clientId: string | null;
  status: "sent" | "delivered" | "read";
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
  deleted: boolean;
};

export type ConversationView = {
  id: string;
  partner: { id: string; name: string | null; role: Role | null };
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
  partnerLastReadAt: Date | null;
  centerId: string | null;
  createdAt: Date;
};

export function toMessageView(m: ConversationMessage): MessageView {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    seq: Number(m.seq),
    body: deleted ? REMOVED_BODY : m.body,
    clientId: m.clientId,
    status: m.status,
    deliveredAt: m.deliveredAt,
    readAt: m.readAt,
    createdAt: m.createdAt,
    deleted,
  };
}

type PartnerLite = { id: string; name: string; role: Role } | undefined;

function toConversationView(
  c: Conversation,
  viewerId: string,
  partner: PartnerLite,
): ConversationView {
  const isA = c.userAId === viewerId;
  const partnerId = isA ? c.userBId : c.userAId;
  return {
    id: c.id,
    partner: partner
      ? { id: partner.id, name: partner.name, role: partner.role }
      : { id: partnerId, name: null, role: null },
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageSenderId: c.lastMessageSenderId,
    unreadCount: isA ? c.aUnreadCount : c.bUnreadCount,
    partnerLastReadAt: isA ? c.bLastReadAt : c.aLastReadAt,
    centerId: c.centerId,
    createdAt: c.createdAt,
  };
}

export function canonicalPair(u1: string, u2: string) {
  return u1 < u2 ? { userAId: u1, userBId: u2 } : { userAId: u2, userBId: u1 };
}

export function otherParticipantId(
  c: Pick<Conversation, "userAId" | "userBId">,
  userId: string,
): string {
  return c.userAId === userId ? c.userBId : c.userAId;
}

function assertParticipant(
  c: Pick<Conversation, "userAId" | "userBId">,
  userId: string,
) {
  if (c.userAId !== userId && c.userBId !== userId) {
    throw new ChatError("not_participant", "Not a participant in this conversation");
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002"
  );
}

export type GetOrCreateOptions = {
  limiter: ChatLimiter;
  skipRateLimit?: boolean;
};

export async function getOrCreateConversation(
  db: TenantTx,
  initiator: ChatActor,
  recipientId: string,
  opts: GetOrCreateOptions,
): Promise<{
  conversation: Conversation;
  created: boolean;
  recipient: { id: string; name: string; role: Role };
}> {
  const pair = canonicalPair(initiator.id, recipientId);
  const existing = await db.conversation.findUnique({
    where: { userAId_userBId: pair },
  });

  if (existing) {
    assertParticipant(existing, initiator.id);
    await assertNotBlocked(db, initiator.id, recipientId);
    const recipient = await db.user.findFirst({
      where: { id: recipientId },
      select: { id: true, name: true, role: true },
    });
    if (!recipient) throw new ChatError("recipient_not_found");
    return { conversation: existing, created: false, recipient };
  }

  if (!opts.skipRateLimit) {
    await consume(
      opts.limiter,
      `chat:new-conv:${initiator.id}`,
      RATE_LIMITS.newConversation,
      "Too many new conversations, please slow down.",
    );
  }

  const { centerId, recipient } = await assertCanReach(db, initiator, recipientId);

  try {
    const conversation = await db.conversation.create({
      data: { ...pair, centerId },
    });
    return { conversation, created: true, recipient };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const raced = await db.conversation.findUnique({
        where: { userAId_userBId: pair },
      });
      if (raced) return { conversation: raced, created: false, recipient };
    }
    throw e;
  }
}

export async function getConversationForUser(
  db: TenantTx,
  userId: string,
  conversationId: string,
): Promise<Conversation> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new ChatError("conversation_not_found");
  assertParticipant(conversation, userId);
  return conversation;
}

export async function listConversations(
  db: TenantTx,
  userId: string,
  opts: { limit?: number; before?: Date } = {},
): Promise<{ conversations: ConversationView[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await db.conversation.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
      ...(opts.before ? { lastMessageAt: { lt: opts.before } } : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const partnerIds = page.map((c) => otherParticipantId(c, userId));
  const partners = partnerIds.length
    ? await db.user.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const partnerMap = new Map(partners.map((p) => [p.id, p]));

  return {
    conversations: page.map((c) =>
      toConversationView(c, userId, partnerMap.get(otherParticipantId(c, userId))),
    ),
    hasMore,
  };
}

export async function getConversationView(
  db: TenantTx,
  userId: string,
  conversationId: string,
): Promise<ConversationView> {
  const conversation = await getConversationForUser(db, userId, conversationId);
  const partnerId = otherParticipantId(conversation, userId);
  const partner = await db.user.findFirst({
    where: { id: partnerId },
    select: { id: true, name: true, role: true },
  });
  return toConversationView(conversation, userId, partner ?? undefined);
}

export async function listMessages(
  db: TenantTx,
  userId: string,
  conversationId: string,
  opts: { beforeSeq?: number; limit?: number } = {},
): Promise<{ messages: MessageView[]; hasMore: boolean }> {
  await getConversationForUser(db, userId, conversationId);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await db.conversationMessage.findMany({
    where: {
      conversationId,
      ...(opts.beforeSeq != null ? { seq: { lt: BigInt(opts.beforeSeq) } } : {}),
    },
    orderBy: { seq: "desc" },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  return {
    messages: rows.slice(0, limit).reverse().map(toMessageView),
    hasMore,
  };
}

export type AppendMessageInput = {
  conversationId?: string;
  recipientId?: string;
  body: string;
  clientId?: string;
};

export type AppendMessageResult = {
  message: MessageView;
  conversation: Conversation;
  recipientId: string;
  duplicate: boolean;
};

export async function appendMessage(
  db: TenantTx,
  sender: ChatActor,
  input: AppendMessageInput,
  opts: { limiter: ChatLimiter },
): Promise<AppendMessageResult> {
  const body = input.body?.trim();
  if (!body) throw new ChatError("invalid_body", "Message cannot be empty");
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new ChatError(
      "invalid_body",
      `Message exceeds ${MAX_MESSAGE_LENGTH} characters`,
    );
  }

  await consume(
    opts.limiter,
    `chat:send:${sender.id}`,
    RATE_LIMITS.send,
    "You are sending messages too quickly, please slow down.",
  );

  let conversation: Conversation;
  if (input.conversationId) {
    conversation = await getConversationForUser(db, sender.id, input.conversationId);
    await assertNotBlocked(
      db,
      sender.id,
      otherParticipantId(conversation, sender.id),
    );
  } else if (input.recipientId) {
    conversation = (
      await getOrCreateConversation(db, sender, input.recipientId, {
        limiter: opts.limiter,
      })
    ).conversation;
  } else {
    throw new ChatError(
      "conversation_not_found",
      "conversationId or recipientId is required",
    );
  }
  const recipientId = otherParticipantId(conversation, sender.id);

  if (input.clientId) {
    const dup = await db.conversationMessage.findUnique({
      where: {
        conversationId_clientId: {
          conversationId: conversation.id,
          clientId: input.clientId,
        },
      },
    });
    if (dup) {
      return {
        message: toMessageView(dup),
        conversation,
        recipientId,
        duplicate: true,
      };
    }
  }

  let created: ConversationMessage;
  try {
    created = await db.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: sender.id,
        body,
        clientId: input.clientId ?? null,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e) && input.clientId) {
      const dup = await db.conversationMessage.findUnique({
        where: {
          conversationId_clientId: {
            conversationId: conversation.id,
            clientId: input.clientId,
          },
        },
      });
      if (dup) {
        return {
          message: toMessageView(dup),
          conversation,
          recipientId,
          duplicate: true,
        };
      }
    }
    throw e;
  }

  const senderIsA = conversation.userAId === sender.id;
  const updated = await db.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: created.createdAt,
      lastMessagePreview: body.slice(0, PREVIEW_LENGTH),
      lastMessageSenderId: sender.id,
      ...(senderIsA
        ? { bUnreadCount: { increment: 1 } }
        : { aUnreadCount: { increment: 1 } }),
    },
  });

  return {
    message: toMessageView(created),
    conversation: updated,
    recipientId,
    duplicate: false,
  };
}

export async function markMessageDelivered(
  db: TenantTx,
  messageId: string,
): Promise<Date> {
  const now = new Date();
  await db.conversationMessage.updateMany({
    where: { id: messageId, status: "sent" }, // never downgrade read → delivered
    data: { status: "delivered", deliveredAt: now },
  });
  return now;
}

export type DeliveredSweepGroup = {
  conversationId: string;
  senderId: string;
  maxSeq: number;
  deliveredAt: Date;
};

export async function markDeliveredForUser(
  db: TenantTx,
  userId: string,
): Promise<DeliveredSweepGroup[]> {
  const pending = await db.conversationMessage.findMany({
    where: {
      status: "sent",
      senderId: { not: userId },
      conversation: { OR: [{ userAId: userId }, { userBId: userId }] },
    },
    select: { id: true, conversationId: true, senderId: true, seq: true },
  });
  if (!pending.length) return [];

  const now = new Date();
  await db.conversationMessage.updateMany({
    where: { id: { in: pending.map((p) => p.id) } },
    data: { status: "delivered", deliveredAt: now },
  });

  const groups = new Map<string, DeliveredSweepGroup>();
  for (const p of pending) {
    const g = groups.get(p.conversationId);
    const seq = Number(p.seq);
    if (!g) {
      groups.set(p.conversationId, {
        conversationId: p.conversationId,
        senderId: p.senderId,
        maxSeq: seq,
        deliveredAt: now,
      });
    } else if (seq > g.maxSeq) {
      g.maxSeq = seq;
    }
  }
  return [...groups.values()];
}

export type ReadReceipt = {
  conversationId: string;
  readerId: string;
  otherUserId: string;
  readAt: Date;
  updatedCount: number;
};

export async function markConversationRead(
  db: TenantTx,
  userId: string,
  conversationId: string,
): Promise<ReadReceipt> {
  const conversation = await getConversationForUser(db, userId, conversationId);
  const now = new Date();

  await db.conversationMessage.updateMany({
    where: { conversationId, senderId: { not: userId }, deliveredAt: null },
    data: { deliveredAt: now },
  });
  const updated = await db.conversationMessage.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { status: "read", readAt: now },
  });

  const isA = conversation.userAId === userId;
  await db.conversation.update({
    where: { id: conversationId },
    data: isA
      ? { aUnreadCount: 0, aLastReadAt: now }
      : { bUnreadCount: 0, bLastReadAt: now },
  });

  return {
    conversationId,
    readerId: userId,
    otherUserId: otherParticipantId(conversation, userId),
    readAt: now,
    updatedCount: updated.count,
  };
}

export async function getTotalUnread(
  db: TenantTx,
  userId: string,
): Promise<number> {
  const [a, b] = await Promise.all([
    db.conversation.aggregate({
      _sum: { aUnreadCount: true },
      where: { userAId: userId },
    }),
    db.conversation.aggregate({
      _sum: { bUnreadCount: true },
      where: { userBId: userId },
    }),
  ]);
  return (a._sum.aUnreadCount ?? 0) + (b._sum.bUnreadCount ?? 0);
}

export async function listPartnerIds(
  db: TenantTx,
  userId: string,
  limit = 500,
): Promise<string[]> {
  const rows = await db.conversation.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: { userAId: true, userBId: true },
  });
  return [...new Set(rows.map((c) => otherParticipantId(c, userId)))];
}
