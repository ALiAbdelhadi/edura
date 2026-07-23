// =============================================================================
// Chat domain queries — shared by the Next.js REST layer AND the standalone
// realtime WebSocket server (both pass their own transaction/context wrapper).
// Every function takes a `db: TenantTx` so callers control tenancy/RLS context.
//
// AUTHORIZATION LIVES IN chat-scope.ts, NOT HERE. This module persists and
// reads; it delegates every "may they?" question to `assertCanReach` /
// `assertNotBlocked` so there is exactly one implementation of the rules.
// The types below are re-exported from chat-scope for import compatibility.
// =============================================================================

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

/** Body shown in place of a soft-deleted message for participants. */
export const REMOVED_BODY = "";

// ---------------------------------------------------------------------------
// Wire types (JSON-safe: BigInt seq → number)
// ---------------------------------------------------------------------------
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
  /** Soft-deleted: body is blanked for participants, retained in the log. */
  deleted: boolean;
};

export type ConversationView = {
  id: string;
  partner: { id: string; name: string | null; role: Role | null };
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  unreadCount: number;
  /** Partner's read cursor — my messages up to this instant are "read". */
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
    // Retention: the row keeps the body forever (super-admin log); participants
    // just stop seeing it. There is no hard-delete path anywhere.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export type GetOrCreateOptions = {
  /**
   * REQUIRED on every path that can CREATE a conversation. Typed as required so
   * a new transport cannot ship an unlimited channel by omission — the socket
   * server was exactly that gap before this existed.
   */
  limiter: ChatLimiter;
  /** Skip the new-conversation bucket when the caller already consumed one. */
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
    // Replies inside an existing conversation skip the relationship gate (the
    // relationship may legitimately have ended — a finished course still needs
    // its thread readable) but NEVER skip blocks.
    await assertNotBlocked(db, initiator.id, recipientId);
    const recipient = await db.user.findFirst({
      where: { id: recipientId },
      select: { id: true, name: true, role: true },
    });
    if (!recipient) throw new ChatError("recipient_not_found");
    return { conversation: existing, created: false, recipient };
  }

  // Opening a NEW conversation is the harassment-relevant action: gate it
  // BEFORE doing the relationship lookups so a flood cannot be used to probe
  // the directory either.
  if (!opts.skipRateLimit) {
    await consume(
      opts.limiter,
      `chat:new-conv:${initiator.id}`,
      RATE_LIMITS.newConversation,
      "Too many new conversations, please slow down.",
    );
  }

  // THE gate — matrix + relationship + block, all in one call.
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

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
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

/**
 * Persist a message. `sender` is ALWAYS the authenticated actor — transports
 * must never accept a senderId from the client. Handles clientId idempotency
 * (safe retries after reconnects) and updates the denormalized list state.
 *
 * `limiter` is REQUIRED: every send path is rate limited, and a transport that
 * forgets one fails to compile.
 */
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
    // Blocks apply to replies too — the relationship gate does not run for an
    // existing thread, so this is the check that stops a blocked sender.
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
    // clientId retry race — the first attempt won; return it idempotently.
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

// ---------------------------------------------------------------------------
// Delivery / read state
// ---------------------------------------------------------------------------

/** Recipient's client confirmed receipt of a single just-sent message. */
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

/**
 * Delivered-on-connect sweep: everything addressed to `userId` that was sent
 * while they were offline becomes "delivered". Returns per-conversation groups
 * so the socket layer can push receipts to each sender.
 */
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

/** Reader opened the conversation: zero their counter, mark partner's messages read. */
export async function markConversationRead(
  db: TenantTx,
  userId: string,
  conversationId: string,
): Promise<ReadReceipt> {
  const conversation = await getConversationForUser(db, userId, conversationId);
  const now = new Date();

  // Anything not yet delivered is implicitly delivered the moment it is read.
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

/** Distinct partner ids of a user's most recent conversations (presence fanout). */
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
